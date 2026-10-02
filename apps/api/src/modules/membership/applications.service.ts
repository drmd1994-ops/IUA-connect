import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale, DEFAULT_LOCALE, isLocale } from '@iua/i18n';
import { uuidv7 } from '@iua/shared';
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
import { type Notice, Notifier } from '../notifications';
import { AuditService } from '../audit';
import {
  type ApplicationDto,
  type ApplyDto,
  type DecisionDto,
  type ReviewApplicationDto,
} from './membership.dto';
import { checkIdentifier, identifierHashInput } from './identifier';
import { MembershipsService } from './memberships.service';
import { afterDecision, initialState, isOpen, OPEN_STATES, type Flag, stageOf } from './workflow';

const DIRECTOR_ROLE = 'DEPARTMENT_DIRECTOR';

const INCLUDE = {
  type: true,
  hospital: true,
  department: true,
  decisions: { orderBy: { at: 'asc' } },
  user: { select: { id: true, email: true, locale: true, profile: true } },
} satisfies Prisma.VerificationRequestInclude;

type RequestRow = Prisma.VerificationRequestGetPayload<{ include: typeof INCLUDE }>;

/**
 * Membership applications (ARCHITECTURE.md §7, D3): the member applies, the department director
 * decides, then an IUA admin gives final approval. Certificate and licence numbers are stored
 * encrypted with a keyed hash, and never returned, logged or audited.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly hasher: SecretHasher,
    private readonly notifier: Notifier,
    private readonly audit: AuditService,
    private readonly memberships: MembershipsService,
  ) {}

  // --- The applicant ----------------------------------------------------------------------

  async apply(userId: string, input: ApplyDto, meta: RequestMeta): Promise<ApplicationDto> {
    const type = await this.prisma.membershipType.findFirst({
      where: { id: input.typeId, active: true, selfApply: true },
    });
    if (!type) throw invalid('typeId', 'unknownMembershipType');

    const identifier = checkIdentifier(type.identifier, input.identifier);
    if (!identifier.ok) throw invalid('identifier', identifier.code);

    if (type.directorApproval && !input.departmentId) {
      throw invalid('departmentId', 'departmentRequired');
    }
    if (input.departmentId && !input.hospitalId) throw invalid('hospitalId', 'hospitalRequired');
    if (input.hospitalId) await this.ensurePlace(input.hospitalId, input.departmentId);

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile?.firstName || !profile.lastName) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [
        { field: 'profile', code: 'profileIncomplete' },
      ]);
    }
    const open = await this.prisma.verificationRequest.findFirst({
      where: { userId, state: { in: [...OPEN_STATES] } },
    });
    if (open) throw APPLICATION_OPEN();

    const hash = identifier.value
      ? this.hasher.hash(identifierHashInput(type.identifier, identifier.value))
      : null;
    if (hash && (await this.identifierTaken(hash, userId))) throw IDENTIFIER_IN_USE();

    const directors = input.departmentId
      ? await this.prisma.userRole.findMany({
          where: {
            role: { key: DIRECTOR_ROLE },
            scopeType: 'DEPARTMENT',
            scopeId: input.departmentId,
          },
          select: { userId: true },
        })
      : [];
    const { state, flags } = initialState({
      directorApproval: type.directorApproval,
      otherDirectors: directors.filter((d) => d.userId !== userId).length,
      applicantIsDirector: directors.some((d) => d.userId === userId),
    });

    const id = uuidv7();
    try {
      await this.prisma.verificationRequest.create({
        data: {
          id,
          userId,
          typeId: type.id,
          hospitalId: input.hospitalId ?? null,
          departmentId: input.departmentId ?? null,
          state,
          flags,
          identifierEnc: identifier.value ? this.cipher.encrypt(identifier.value) : null,
          identifierHash: hash,
        },
      });
    } catch (error) {
      // A concurrent request got past the checks above; the partial unique indexes stop it.
      if (isUniqueViolation(error, 'one_open_per_identifier')) throw IDENTIFIER_IN_USE();
      if (isUniqueViolation(error, 'one_open_per_user')) throw APPLICATION_OPEN();
      if (isUniqueViolation(error)) throw new AppException('CONFLICT');
      throw error;
    }

    await this.audit.record({
      action: 'membership.application.submit',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'verification_request',
      entityId: id,
      changes: { type: type.key, state, flags, identifierProvided: identifier.value !== null },
    });
    const row = await this.load(id);
    await this.notify(row, 'membershipApplicationReceived');
    return view(row);
  }

  async mine(userId: string): Promise<ApplicationDto[]> {
    const rows = await this.prisma.verificationRequest.findMany({
      where: { userId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(view);
  }

  async withdraw(userId: string, id: string, meta: RequestMeta): Promise<ApplicationDto> {
    const row = await this.prisma.verificationRequest.findFirst({ where: { id, userId } });
    if (!row) throw new AppException('NOT_FOUND');
    const { count } = await this.prisma.verificationRequest.updateMany({
      where: { id, state: { in: [...OPEN_STATES] } },
      data: { state: 'WITHDRAWN', closedAt: new Date() },
    });
    if (count === 0) {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'applicationClosed' }]);
    }
    await this.audit.record({
      action: 'membership.application.withdraw',
      correlationId: meta.correlationId,
      actorUserId: userId,
      actorIp: meta.ip,
      entityType: 'verification_request',
      entityId: id,
    });
    return view(await this.load(id));
  }

  // --- Directors and admins ---------------------------------------------------------------

  /** Applications waiting for the caller: their departments (director) or final approval (admin). */
  async queue(principal: Principal, stage: 'director' | 'admin'): Promise<ReviewApplicationDto[]> {
    let where: Prisma.VerificationRequestWhereInput;
    if (stage === 'director') {
      if (!principal.permissions.has('membership.approve.department')) {
        throw new AppException('FORBIDDEN');
      }
      where = {
        state: 'PENDING_DIRECTOR',
        departmentId: { in: await this.directedDepartments(principal.userId) },
      };
    } else {
      if (!principal.permissions.has('membership.approve.final')) {
        throw new AppException('FORBIDDEN');
      }
      where = { state: 'PENDING_ADMIN' };
    }
    const rows = await this.prisma.verificationRequest.findMany({
      where: { ...where, userId: { not: principal.userId } },
      include: INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(reviewView);
  }

  async decide(
    principal: Principal,
    id: string,
    input: DecisionDto,
    meta: RequestMeta,
  ): Promise<ReviewApplicationDto> {
    const canDirect = principal.permissions.has('membership.approve.department');
    const canApprove = principal.permissions.has('membership.approve.final');
    if (!canDirect && !canApprove) throw new AppException('FORBIDDEN');

    const request = await this.prisma.verificationRequest.findUnique({ where: { id } });
    if (!request) throw new AppException('NOT_FOUND');
    const stage = stageOf(request.state);
    // Applications the caller has no say in look the same as missing ones. A closed one is
    // visible to admins and to directors of its department.
    const directs =
      canDirect &&
      !!request.departmentId &&
      (await this.directedDepartments(principal.userId)).includes(request.departmentId);
    const inScope =
      stage === 'DIRECTOR' ? directs : stage === 'ADMIN' ? canApprove : canApprove || directs;
    if (!inScope) throw new AppException('NOT_FOUND');
    if (!stage) throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'applicationClosed' }]);
    if (request.userId === principal.userId) {
      throw new AppException('FORBIDDEN', [{ code: 'ownApplication' }]);
    }

    const next = afterDecision(request.state, input.decision);
    const reason = input.reason ? input.reason : null;
    let endDate: Date | null = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.verificationRequest.updateMany({
          where: { id, state: request.state },
          data: { state: next, ...(isOpen(next) ? {} : { closedAt: new Date() }) },
        });
        // Someone else decided first.
        if (count === 0) throw new AppException('CONFLICT', [{ code: 'applicationChanged' }]);
        await tx.verificationDecision.create({
          data: {
            id: uuidv7(),
            requestId: id,
            stage,
            decision: input.decision,
            decidedBy: principal.userId,
            reason,
          },
        });
        if (next === 'APPROVED') {
          endDate = await this.memberships.grant(tx, {
            userId: request.userId,
            typeId: request.typeId,
            identifierEnc: request.identifierEnc,
            identifierHash: request.identifierHash,
            changedBy: principal.userId,
            source: 'MANUAL',
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error, 'identifier_hash')) throw IDENTIFIER_IN_USE();
      throw error;
    }

    await this.audit.record({
      action: 'membership.application.decide',
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'verification_request',
      entityId: id,
      changes: { stage, decision: input.decision, state: next },
    });

    const row = await this.load(id);
    if (next === 'REJECTED') await this.notify(row, 'membershipRejected', { reason: reason ?? '' });
    else if (next === 'PENDING_ADMIN') await this.notify(row, 'membershipDirectorApproved');
    else if (endDate) await this.notify(row, 'membershipApproved', { endDate });
    return reviewView(row);
  }

  // --- internals ------------------------------------------------------------------------------

  private async directedDepartments(userId: string): Promise<string[]> {
    const grants = await this.prisma.userRole.findMany({
      where: { userId, role: { key: DIRECTOR_ROLE }, scopeType: 'DEPARTMENT' },
      select: { scopeId: true },
    });
    return grants.map((grant) => grant.scopeId!);
  }

  /** The number belongs to someone else's membership or open application. */
  private async identifierTaken(hash: string, userId: string): Promise<boolean> {
    const [membership, open] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { identifierHash: hash, userId: { not: userId } },
      }),
      this.prisma.verificationRequest.findFirst({
        where: { identifierHash: hash, state: { in: [...OPEN_STATES] } },
      }),
    ]);
    return membership !== null || open !== null;
  }

  private async ensurePlace(hospitalId: string, departmentId?: string): Promise<void> {
    const hospital = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, active: true },
    });
    if (!hospital) throw invalid('hospitalId', 'unknownHospital');
    if (!departmentId) return;
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, hospitalId, active: true },
    });
    if (!department) throw invalid('departmentId', 'unknownDepartment');
  }

  private load(id: string): Promise<RequestRow> {
    return this.prisma.verificationRequest.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  }

  /** Emails the applicant in their language. A failed email never undoes the decision. */
  private async notify(
    row: RequestRow,
    template: Extract<
      EmailTemplate,
      | 'membershipApplicationReceived'
      | 'membershipDirectorApproved'
      | 'membershipApproved'
      | 'membershipRejected'
    >,
    extra: { reason?: string; endDate?: Date } = {},
  ): Promise<void> {
    const locale: Locale = isLocale(row.user.locale) ? row.user.locale : DEFAULT_LOCALE;
    const base = {
      typeName: locale === 'he' ? row.type.nameHe : row.type.nameEn,
      link: new URL(`/${locale}/account/membership`, this.env.APP_BASE_URL).toString(),
    };
    const params =
      template === 'membershipApproved'
        ? { ...base, endDate: formatDate(extra.endDate!, locale) }
        : template === 'membershipRejected'
          ? { ...base, reason: extra.reason ?? '' }
          : base;
    try {
      await this.notifier.send({
        userId: row.userId,
        kind: 'ACCOUNT',
        to: row.user.email,
        locale,
        template,
        params,
      } as Notice);
    } catch (error) {
      this.logger.error({ err: error, template, requestId: row.id }, 'Membership email failed');
    }
  }
}

function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    timeZone: 'UTC',
    dateStyle: 'long',
  }).format(date);
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);

const APPLICATION_OPEN = () =>
  new AppException('CONFLICT', [{ field: 'typeId', code: 'applicationOpen' }]);

const IDENTIFIER_IN_USE = () =>
  new AppException('CONFLICT', [{ field: 'identifier', code: 'identifierInUse' }]);

const named = (row: { id: string; nameHe: string; nameEn: string } | null) =>
  row ? { id: row.id, nameHe: row.nameHe, nameEn: row.nameEn } : null;

function view(row: RequestRow): ApplicationDto {
  return {
    id: row.id,
    state: row.state,
    type: { id: row.type.id, key: row.type.key, nameHe: row.type.nameHe, nameEn: row.type.nameEn },
    hospital: named(row.hospital),
    department: named(row.department),
    identifierProvided: row.identifierHash !== null,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    decisions: row.decisions.map((d) => ({
      stage: d.stage,
      decision: d.decision,
      reason: d.reason,
      at: d.at.toISOString(),
    })),
  };
}

function reviewView(row: RequestRow): ReviewApplicationDto {
  const profile = row.user.profile;
  return {
    ...view(row),
    applicant: {
      userId: row.user.id,
      email: row.user.email,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      nameHe: profile?.nameHe ?? null,
      nameEn: profile?.nameEn ?? null,
    },
    flags: row.flags as Flag[],
  };
}
