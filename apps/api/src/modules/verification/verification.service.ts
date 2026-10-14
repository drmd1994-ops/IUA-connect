import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale, DEFAULT_LOCALE, getMessages, isLocale } from '@medconnect/i18n';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type Prisma } from '../../generated/prisma/client';
import { FieldCipher, SecretHasher } from '../../infra/crypto/secrets';
import { type EmailTemplate } from '../../infra/mailer/mailer';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { type FileView, FilesService } from '../files';
import { type Notice, Notifier } from '../notifications';
import {
  type MyVerificationDto,
  type ReviewVerificationDto,
  type SubmitVerificationDto,
  type VerificationDecisionDto,
  type VerificationRequestDto,
} from './verification.dto';
import {
  type Kind,
  type RequestState,
  EXPIRY_NOTICE_DAYS,
  approvalProblem,
  canAsk,
  checkSubmission,
  normalNumber,
  numberHashInput,
  statusOf,
  verifiedUntil,
} from './verification-rules';

const INCLUDE = {
  school: true,
  decisions: { orderBy: { at: 'asc' } },
} satisfies Prisma.PhysicianVerificationInclude;

const REVIEW_INCLUDE = {
  ...INCLUDE,
  user: { select: { id: true, email: true, profile: true } },
} satisfies Prisma.PhysicianVerificationInclude;

type Row = Prisma.PhysicianVerificationGetPayload<{ include: typeof INCLUDE }>;
type ReviewRow = Prisma.PhysicianVerificationGetPayload<{ include: typeof REVIEW_INCLUDE }>;

/** A licence number counts as someone else's while one of these holds it. */
const HOLDING: RequestState[] = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The platform's own verification of physicians and medical students (M17 plan §2 to §4, §10,
 * §11). A person asks; a reviewer with physicians.verify checks a physician against the Ministry
 * of Health's public register, or reads a student's confirmation from their school, and decides.
 *
 * Licence and certificate numbers are stored encrypted with a keyed hash, and never returned,
 * logged or audited: to approve, the reviewer types the number the register shows and is told
 * only whether it matches. A student's confirmation is deleted once it is decided on. Being
 * verified ends in users.verified_at, which everything else already asks (M16).
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly hasher: SecretHasher,
    private readonly files: FilesService,
    private readonly notifier: Notifier,
    private readonly audit: AuditService,
  ) {}

  // --- The person -------------------------------------------------------------------------

  async mine(userId: string, now = new Date()): Promise<MyVerificationDto> {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { verifiedAt: true, verifiedAs: true, verifiedUntil: true },
      }),
      this.latest(userId),
    ]);
    const standing = { ...user, latest };
    const status = statusOf(standing, now);
    const verified = status === 'VERIFIED';
    return {
      status,
      verifiedAs: verified ? user.verifiedAs : null,
      verifiedUntil: verified ? (user.verifiedUntil?.toISOString() ?? null) : null,
      byOrganisation: verified && user.verifiedUntil === null,
      canAsk: canAsk(standing, now),
      latest: latest ? view(latest) : null,
    };
  }

  /** A student's confirmation from their school: a picture or a PDF, up to 10 MB. */
  uploadDocument(
    userId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    meta: RequestMeta,
  ): Promise<FileView> {
    return this.files.upload(file, 'VERIFICATION', userId, meta);
  }

  async submit(
    userId: string,
    input: SubmitVerificationDto,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<VerificationRequestDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { verifiedAt: true, verifiedUntil: true, profile: true },
    });
    const standing = { ...user, latest: await this.latest(userId) };
    if (standing.latest?.state === 'PENDING') throw VERIFICATION_OPEN();
    if (!canAsk(standing, now)) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'alreadyVerified' }]);
    }
    // The reviewer looks the person up by name in the register.
    if (!user.profile?.firstName || !user.profile.lastName) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [
        { field: 'profile', code: 'profileIncomplete' },
      ]);
    }

    const checked = checkSubmission(input, now);
    if (!checked.ok) throw invalid(checked.field, checked.code);
    const { licence, certificate, expectedGraduation } = checked.value;

    if (input.schoolId) {
      const school = await this.prisma.medicalSchool.findFirst({
        where: { id: input.schoolId, active: true },
      });
      if (!school) throw invalid('schoolId', 'unknownSchool');
    }
    if (input.documentFileId) {
      const document = await this.prisma.storedFile.findFirst({
        where: {
          id: input.documentFileId,
          ownerUserId: userId,
          purpose: 'VERIFICATION',
          attachedAt: null,
        },
      });
      if (!document) throw invalid('documentFileId', 'unknownDocument');
    }

    const licenceHash = licence ? this.hasher.hash(numberHashInput('licence', licence)) : null;
    if (licenceHash && (await this.licenceTaken(licenceHash, userId))) throw LICENCE_IN_USE();

    const id = uuidv7();
    try {
      await this.prisma.physicianVerification.create({
        data: {
          id,
          userId,
          kind: input.kind,
          licenceEnc: licence ? this.cipher.encrypt(licence) : null,
          licenceHash,
          certificateEnc: certificate ? this.cipher.encrypt(certificate) : null,
          certificateHash: certificate
            ? this.hasher.hash(numberHashInput('certificate', certificate))
            : null,
          schoolId: input.schoolId ?? null,
          expectedGraduation,
          documentFileId: input.documentFileId ?? null,
          note: input.note ? input.note : null,
        },
      });
    } catch (error) {
      // A concurrent request got past the checks above; the partial unique indexes stop it.
      if (isUniqueViolation(error, 'one_open_per_user')) throw VERIFICATION_OPEN();
      if (isUniqueViolation(error, 'licence')) throw LICENCE_IN_USE();
      throw error;
    }
    if (input.documentFileId) await this.files.markAttached(input.documentFileId);

    await this.audit.record({
      action: 'physician.verification.submit',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'physician_verification',
      entityId: id,
      changes: {
        kind: input.kind,
        licenceProvided: licence !== null,
        certificateProvided: certificate !== null,
        documentProvided: !!input.documentFileId,
      },
    });
    await this.notify(userId, 'physicianVerificationReceived', {});
    return view(await this.load(id));
  }

  async withdraw(userId: string, meta: RequestMeta): Promise<VerificationRequestDto> {
    const open = await this.prisma.physicianVerification.findFirst({
      where: { userId, state: 'PENDING' },
    });
    if (!open) throw CLOSED();
    const { count } = await this.prisma.physicianVerification.updateMany({
      where: { id: open.id, state: 'PENDING' },
      data: { state: 'WITHDRAWN', closedAt: new Date() },
    });
    if (count === 0) throw CLOSED();
    if (open.documentFileId) await this.files.remove(open.documentFileId);
    await this.audit.record({
      action: 'physician.verification.withdraw',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'physician_verification',
      entityId: open.id,
    });
    return view(await this.load(open.id));
  }

  // --- Reviewers --------------------------------------------------------------------------

  /** Waiting requests oldest first, or decided ones newest first. Never the reviewer's own. */
  async queue(
    principal: Principal,
    state: RequestState,
    now = new Date(),
  ): Promise<ReviewVerificationDto[]> {
    const rows = await this.prisma.physicianVerification.findMany({
      where: { state, userId: { not: principal.userId } },
      include: REVIEW_INCLUDE,
      orderBy: { createdAt: state === 'PENDING' ? 'asc' : 'desc' },
      take: 200,
    });
    const earlier = await this.earlierOf(rows);
    return rows.map((row) => reviewView(row, earlier.get(row.userId) ?? [], now));
  }

  async one(principal: Principal, id: string, now = new Date()): Promise<ReviewVerificationDto> {
    const row = await this.reviewable(principal, id);
    const earlier = await this.earlierOf([row]);
    return reviewView(row, earlier.get(row.userId) ?? [], now);
  }

  /** A five-minute link to a student's confirmation. Each look is in the audit log. */
  async documentLink(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<{ url: string; expiresAt: string }> {
    const row = await this.reviewable(principal, id);
    if (!row.documentFileId) throw new AppException('NOT_FOUND');
    await this.audit.record({
      action: 'physician.verification.document.read',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'physician_verification',
      entityId: id,
    });
    return this.files.signedUrlFor(row.documentFileId);
  }

  async decide(
    principal: Principal,
    id: string,
    input: VerificationDecisionDto,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<ReviewVerificationDto> {
    const request = await this.reviewable(principal, id);
    if (request.state !== 'PENDING') throw CLOSED();

    // What the reviewer typed from the register, compared with what the person gave.
    const licenceMatches = this.matches('licence', input.registerLicence, request.licenceHash);
    const certificateMatches = this.matches(
      'certificate',
      input.registerCertificate,
      request.certificateHash,
    );
    const findings = {
      registerStatus: input.registerStatus ?? null,
      licenceMatches,
      certificateMatches,
    };

    if (input.decision === 'APPROVE') {
      const problem = approvalProblem({
        kind: request.kind,
        registerStatus: input.registerStatus,
        licenceMatches,
        certificateMatches,
      });
      if (problem || (request.kind === 'STUDENT' && !request.documentFileId)) {
        // A failed comparison is recorded too: numbers are not guessed through this door.
        await this.audit.record({
          action: 'physician.verification.compare',
          correlationId: meta.correlationId,
          actorUserId: principal.userId,
          actorIp: meta.ip,
          entityType: 'physician_verification',
          entityId: id,
          changes: findings,
        });
        throw new AppException('BUSINESS_RULE_VIOLATION', [
          problem ?? { field: 'documentFileId', code: 'documentMissing' },
        ]);
      }
    }

    const approve = input.decision === 'APPROVE';
    const until = approve ? verifiedUntil(request.kind, request.expectedGraduation, now) : null;
    await this.prisma.$transaction(async (tx) => {
      if (approve) {
        // A renewal takes the place of the verification it renews (first: a number is in one
        // approved request at most).
        await tx.physicianVerification.updateMany({
          where: { userId: request.userId, state: 'APPROVED' },
          data: { state: 'EXPIRED' },
        });
      }
      const { count } = await tx.physicianVerification.updateMany({
        where: { id, state: 'PENDING' },
        data: { state: approve ? 'APPROVED' : 'REJECTED', closedAt: now },
      });
      // Someone else decided first.
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'verificationChanged' }]);
      await tx.physicianVerificationDecision.create({
        data: {
          id: uuidv7(),
          verificationId: id,
          decision: input.decision,
          decidedBy: principal.userId,
          reason: input.reason ? input.reason : null,
          ...findings,
        },
      });
      if (approve) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: request.userId },
          select: { verifiedAt: true },
        });
        await tx.user.update({
          where: { id: request.userId },
          data: {
            verifiedAt: user.verifiedAt ?? now,
            verifiedAs: request.kind,
            verifiedUntil: until,
          },
        });
      }
    });
    // The confirmation is not kept once it is decided on; only the decision is.
    if (request.documentFileId) await this.files.remove(request.documentFileId);

    await this.audit.record({
      action: 'physician.verification.decide',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'physician_verification',
      entityId: id,
      changes: { decision: input.decision, kind: request.kind, ...findings },
    });
    if (approve) {
      await this.notify(request.userId, 'physicianVerificationApproved', {
        kind: request.kind,
        until: until!,
      });
    } else {
      await this.notify(request.userId, 'physicianVerificationRejected', {
        reason: input.reason ?? '',
      });
    }
    return this.one(principal, id, now);
  }

  /**
   * Ends a person's verification, whichever way it was given. Their account stays, and an
   * organisation's membership stays; what is open to verified physicians closes at once.
   */
  async revoke(
    principal: Principal,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<void> {
    if (userId === principal.userId) {
      throw new AppException('FORBIDDEN', [{ code: 'ownVerification' }]);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verifiedAt: true },
    });
    if (!user) throw new AppException('NOT_FOUND');
    if (!user.verifiedAt) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'notVerified' }]);
    }
    let requestId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { verifiedAt: null, verifiedAs: null, verifiedUntil: null },
      });
      const approved = await tx.physicianVerification.findFirst({
        where: { userId, state: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
      });
      if (approved) {
        requestId = approved.id;
        await tx.physicianVerification.update({
          where: { id: approved.id },
          data: { state: 'REVOKED' },
        });
        await tx.physicianVerificationDecision.create({
          data: {
            id: uuidv7(),
            verificationId: approved.id,
            decision: 'REVOKE',
            decidedBy: principal.userId,
            reason,
          },
        });
      }
    });
    await this.audit.record({
      action: 'physician.verification.revoke',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: userId,
      changes: { request: requestId },
    });
    await this.notify(userId, 'physicianVerificationRevoked', { reason });
  }

  // --- Looking again (step 7) -------------------------------------------------------------

  /**
   * Tells each person whose platform verification ends within EXPIRY_NOTICE_DAYS, once, unless
   * they already asked to renew. Returns how many were told.
   */
  async remindDue(now = new Date()): Promise<number> {
    const due = await this.prisma.physicianVerification.findMany({
      where: {
        state: 'APPROVED',
        noticeSentAt: null,
        user: {
          verifiedUntil: { gt: now, lte: new Date(now.getTime() + EXPIRY_NOTICE_DAYS * DAY_MS) },
          physicianChecks: { none: { state: 'PENDING' } },
        },
      },
      select: { id: true, userId: true, user: { select: { verifiedUntil: true } } },
      take: 500,
    });
    for (const row of due) {
      // Marked first: a person is told once, even if the email fails.
      const { count } = await this.prisma.physicianVerification.updateMany({
        where: { id: row.id, noticeSentAt: null },
        data: { noticeSentAt: now },
      });
      if (count === 1) {
        await this.notify(row.userId, 'physicianVerificationExpiring', {
          until: row.user.verifiedUntil!,
        });
      }
    }
    return due.length;
  }

  /**
   * Ends every verification whose date passed: the account stays, and what is open to verified
   * physicians closes (it already did, at the date: see verifiedNow). Returns how many ended.
   */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { verifiedAt: { not: null }, verifiedUntil: { lte: now } },
      select: { id: true },
      take: 500,
    });
    for (const user of due) {
      const ended = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.user.updateMany({
          where: { id: user.id, verifiedUntil: { lte: now } },
          data: { verifiedAt: null, verifiedAs: null, verifiedUntil: null },
        });
        await tx.physicianVerification.updateMany({
          where: { userId: user.id, state: 'APPROVED' },
          data: { state: 'EXPIRED', closedAt: now },
        });
        return count === 1;
      });
      if (!ended) continue;
      await this.audit.record({
        action: 'physician.verification.expire',
        correlationId: `job-${uuidv7()}`,
        entityType: 'user',
        entityId: user.id,
      });
      await this.notify(user.id, 'physicianVerificationExpired', {});
    }
    return due.length;
  }

  // --- internals ------------------------------------------------------------------------------

  private latest(userId: string): Promise<Row | null> {
    return this.prisma.physicianVerification.findFirst({
      where: { userId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  private load(id: string): Promise<Row> {
    return this.prisma.physicianVerification.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  /** A request a reviewer may look at: anyone's but their own. Their own looks missing. */
  private async reviewable(principal: Principal, id: string): Promise<ReviewRow> {
    const row = await this.prisma.physicianVerification.findUnique({
      where: { id },
      include: REVIEW_INCLUDE,
    });
    if (!row || row.userId === principal.userId) throw new AppException('NOT_FOUND');
    return row;
  }

  private async earlierOf(rows: ReviewRow[]): Promise<Map<string, ReviewRow[]>> {
    const others = await this.prisma.physicianVerification.findMany({
      where: {
        userId: { in: [...new Set(rows.map((row) => row.userId))] },
        id: { notIn: rows.map((row) => row.id) },
      },
      include: REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const byUser = new Map<string, ReviewRow[]>();
    for (const row of others) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
    return byUser;
  }

  /** Whether a typed number matches the stored one; null when either is missing. */
  private matches(
    which: 'licence' | 'certificate',
    typed: string | undefined,
    stored: string | null,
  ): boolean | null {
    const value = normalNumber(typed);
    if (value === null || stored === null) return null;
    return this.hasher.hash(numberHashInput(which, value)) === stored;
  }

  /** The number is in another person's request that is waiting, approved, refused or ended. */
  private async licenceTaken(hash: string, userId: string): Promise<boolean> {
    const other = await this.prisma.physicianVerification.findFirst({
      where: { licenceHash: hash, userId: { not: userId }, state: { in: HOLDING } },
      select: { id: true },
    });
    return other !== null;
  }

  /** Emails the person in their language. A failed email never undoes the decision. */
  private async notify(
    userId: string,
    template: Extract<
      EmailTemplate,
      | 'physicianVerificationReceived'
      | 'physicianVerificationApproved'
      | 'physicianVerificationRejected'
      | 'physicianVerificationRevoked'
      | 'physicianVerificationExpiring'
      | 'physicianVerificationExpired'
    >,
    extra: { kind?: Kind; until?: Date; reason?: string },
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, locale: true },
      });
      const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const link = verificationLink(this.env, locale);
      const params =
        template === 'physicianVerificationApproved'
          ? {
              as: getMessages(locale).verification.as[extra.kind!],
              until: formatDate(extra.until!, locale),
              link,
            }
          : template === 'physicianVerificationExpiring'
            ? { until: formatDate(extra.until!, locale), link }
            : template === 'physicianVerificationReceived' ||
                template === 'physicianVerificationExpired'
              ? { link }
              : { reason: extra.reason ?? '', link };
      await this.notifier.send({
        userId,
        kind: 'ACCOUNT',
        to: user.email,
        locale,
        template,
        params,
      } as Notice);
    } catch (error) {
      this.logger.error({ err: error, template, userId }, 'Verification email failed');
    }
  }
}

export function verificationLink(env: Env, locale: Locale): string {
  return new URL(`/${locale}/account/verification`, env.APP_BASE_URL).toString();
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'long',
  }).format(date);
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);

const VERIFICATION_OPEN = () => new AppException('CONFLICT', [{ code: 'verificationOpen' }]);

const LICENCE_IN_USE = () =>
  new AppException('CONFLICT', [{ field: 'licence', code: 'licenceInUse' }]);

const CLOSED = () => new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'verificationClosed' }]);

const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

function view(row: Row): VerificationRequestDto {
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    licenceProvided: row.licenceHash !== null,
    certificateProvided: row.certificateHash !== null,
    school: row.school
      ? { id: row.school.id, nameHe: row.school.nameHe, nameEn: row.school.nameEn }
      : null,
    expectedGraduation: isoDay(row.expectedGraduation),
    documentHeld: row.documentFileId !== null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    decisions: row.decisions.map((d) => ({
      decision: d.decision,
      reason: d.reason,
      at: d.at.toISOString(),
    })),
  };
}

function reviewView(row: ReviewRow, earlier: ReviewRow[], now: Date): ReviewVerificationDto {
  const profile = row.user.profile;
  return {
    ...view(row),
    person: {
      userId: row.user.id,
      email: row.user.email,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      nameHe: profile?.nameHe ?? null,
      nameEn: profile?.nameEn ?? null,
    },
    waitingDays: Math.floor(((row.closedAt ?? now).getTime() - row.createdAt.getTime()) / DAY_MS),
    findings: row.decisions.map((d) => ({
      decision: d.decision,
      registerStatus: d.registerStatus,
      licenceMatches: d.licenceMatches,
      certificateMatches: d.certificateMatches,
      at: d.at.toISOString(),
    })),
    earlier: earlier.map((e) => ({
      id: e.id,
      kind: e.kind,
      state: e.state,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
