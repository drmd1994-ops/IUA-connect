import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../../../common/auth/principal';
import {
  OWNER_PROBLEM_CODES,
  covers,
  organisationOfNew,
  scopeOf,
} from '../../../common/auth/scope';
import { AppException } from '../../../common/errors/app.exception';
import { type RequestMeta } from '../../../common/request-meta';
import { APP_CONFIG } from '../../../config/config.module';
import { type Env } from '../../../config/env.schema';
import { type Prisma } from '../../../generated/prisma/client';
import { PasswordHasher } from '../../../infra/crypto/password-hasher';
import { FieldCipher, SecretHasher, randomToken } from '../../../infra/crypto/secrets';
import { Mailer } from '../../../infra/mailer/mailer';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../../audit';
import { AuthTokensService } from '../../auth';
import { type IdentifierKind, identifierHashInput } from '../identifier';
import { recordHistory } from '../memberships.service';
import { verifiedAsFor } from '../../../common/verified-as';
import { isoDate, todayInIsrael } from '../period';
import { OPEN_STATES } from '../workflow';
import {
  IMPORT_ACTIONS,
  type ImportAction,
  type ImportBatchDto,
  type ImportReport,
} from './import.dto';
import { type ImportRecord, readImport } from './rows';

/** A dry run can be applied for this long. */
const BATCH_TTL_MS = 24 * 60 * 60 * 1000;

interface PlannedRow {
  line: number;
  email: string | null;
  action: ImportAction;
  reasons: string[];
  changes: string[];
  record: ImportRecord | null;
  identifierHash: string | null;
}

/**
 * CSV membership import with a dry run (D2: the IMA source-of-truth workflow; M2 plan §3.6).
 * The dry run stores only its report and a keyed hash of the file; applying needs the same file
 * again, re-plans every row against the current data, and creates accounts (with a "set your
 * password" email), memberships and history. Applying a batch twice is refused, and re-importing
 * the same file finds every row unchanged.
 *
 * A file brings members into one organisation (M16): the membership types it names are that
 * organisation's, a row is compared with the person's membership there, and a number is in
 * use only within it. Whoever an organisation imports as a member is known to the platform as
 * a physician.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
    private readonly cipher: FieldCipher,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokensService,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  async dryRun(
    csv: string,
    fileName: string | undefined,
    principal: Principal,
    organisation: string | undefined,
    meta: RequestMeta,
  ): Promise<ImportBatchDto> {
    const actorUserId = principal.userId;
    const owner = organisationOfNew(scopeOf(principal, 'membership.manage'), organisation);
    if ('problem' in owner) {
      throw new AppException('VALIDATION_FAILED', [
        { field: 'organisation', code: OWNER_PROBLEM_CODES[owner.problem] },
      ]);
    }
    const { organisationId } = owner;
    const { report } = await this.plan(csv, organisationId);
    if (report.fileErrors.length) return { ...report, batchId: null, status: null };
    const id = uuidv7();
    await this.prisma.importBatch.create({
      data: {
        id,
        organisationId,
        createdBy: actorUserId,
        fileName: fileName ?? null,
        contentHash: this.contentHash(csv),
        report: report as unknown as Prisma.InputJsonValue,
      },
    });
    await this.record('membership.import.dry_run', id, actorUserId, meta, report.totals);
    return { ...report, batchId: id, status: 'DRY_RUN' };
  }

  async apply(
    batchId: string,
    csv: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<ImportBatchDto> {
    const actorUserId = principal.userId;
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch || !covers(scopeOf(principal, 'membership.manage'), batch.organisationId)) {
      throw new AppException('NOT_FOUND');
    }
    const { organisationId } = batch;
    if (batch.status === 'APPLIED') throw rule('CONFLICT', 'batchApplied');
    if (Date.now() - batch.createdAt.getTime() > BATCH_TTL_MS) {
      throw rule('BUSINESS_RULE_VIOLATION', 'batchExpired');
    }
    if (batch.contentHash !== this.contentHash(csv)) {
      throw rule('BUSINESS_RULE_VIOLATION', 'fileChanged');
    }
    // Claim the batch first, so two concurrent applies can't both run.
    const { count } = await this.prisma.importBatch.updateMany({
      where: { id: batchId, status: 'DRY_RUN' },
      data: { status: 'APPLIED', appliedAt: new Date(), appliedBy: actorUserId },
    });
    if (count === 0) throw rule('CONFLICT', 'batchApplied');

    const { report, planned } = await this.plan(csv, organisationId);
    // One hash of a random secret, thrown away: new accounts have no usable password until
    // their owners set one from the email.
    const unusablePassword = await this.passwords.hash(randomToken());
    for (const row of planned) {
      if (!['CREATE_ACCOUNT', 'CREATE_MEMBERSHIP', 'UPDATE_MEMBERSHIP'].includes(row.action)) {
        continue;
      }
      try {
        await this.applyRow(row, batchId, organisationId, actorUserId, unusablePassword);
      } catch (error) {
        this.logger.error({ err: error, batchId, line: row.line }, 'Import row failed');
        const reportRow = report.rows.find((r) => r.line === row.line)!;
        reportRow.action = 'SKIP';
        reportRow.reasons = ['applyFailed'];
        reportRow.changes = [];
      }
    }
    report.totals = totals(report.rows);
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: { report: report as unknown as Prisma.InputJsonValue },
    });
    await this.record('membership.import.apply', batchId, actorUserId, meta, report.totals);
    return { ...report, batchId, status: 'APPLIED' };
  }

  // --- planning -------------------------------------------------------------------------------

  private async plan(
    csv: string,
    organisationId: string,
  ): Promise<{ report: ImportReport; planned: PlannedRow[] }> {
    const today = todayInIsrael();
    const types = await this.prisma.membershipType.findMany({
      where: { active: true, organisationId },
    });
    const kinds = new Map<string, IdentifierKind>(types.map((t) => [t.key, t.identifier]));
    const read = readImport(csv, kinds, today);
    if (read.fileErrors.length) {
      return {
        report: { fileErrors: read.fileErrors, rows: [], totals: totals([]) },
        planned: [],
      };
    }

    const emails = read.rows.flatMap((r) => (r.record ? [r.record.email] : []));
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      include: { memberships: { where: { organisationId }, include: { type: true } } },
    });
    const byEmail = new Map(users.map((u) => [u.email, u]));

    const planned: PlannedRow[] = [];
    for (const row of read.rows) {
      const base = { line: row.line, email: row.email, changes: [] as string[] };
      if (!row.record) {
        planned.push({
          ...base,
          action: 'SKIP',
          reasons: row.reasons,
          record: null,
          identifierHash: null,
        });
        continue;
      }
      const record = row.record;
      const hash = record.identifier
        ? this.hasher.hash(identifierHashInput(record.identifierKind, record.identifier))
        : null;
      const user = byEmail.get(record.email);
      const skip = (reason: string): PlannedRow => ({
        ...base,
        action: 'SKIP',
        reasons: [reason],
        record: null,
        identifierHash: null,
      });

      if (user && user.status !== 'ACTIVE') {
        planned.push(skip('accountNotActive'));
        continue;
      }
      if (hash && (await this.identifierUsedByOther(hash, user?.id ?? null, organisationId))) {
        planned.push(skip('identifierInUse'));
        continue;
      }
      const membership = user?.memberships[0];
      let action: ImportAction;
      const changes: string[] = [];
      if (!user) action = 'CREATE_ACCOUNT';
      else if (!membership) action = 'CREATE_MEMBERSHIP';
      else {
        if (membership.type.key !== record.typeKey) changes.push('type');
        if (isoDate(membership.endDate) !== isoDate(record.endDate)) changes.push('endDate');
        if (record.paymentStatus && membership.paymentStatus !== record.paymentStatus) {
          changes.push('paymentStatus');
        }
        if (hash && membership.identifierHash !== hash) changes.push('identifier');
        action = changes.length ? 'UPDATE_MEMBERSHIP' : 'UNCHANGED';
      }
      planned.push({ ...base, action, reasons: [], changes, record, identifierHash: hash });
    }

    const rows = planned.map(({ record: _record, identifierHash: _hash, ...rest }) => rest);
    return { report: { fileErrors: [], rows, totals: totals(rows) }, planned };
  }

  /** The number belongs to another person's membership or open application. */
  private async identifierUsedByOther(
    hash: string,
    userId: string | null,
    organisationId: string,
  ): Promise<boolean> {
    const notMine = userId ? { userId: { not: userId } } : {};
    const [membership, open] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { identifierHash: hash, organisationId, ...notMine },
      }),
      this.prisma.verificationRequest.findFirst({
        where: {
          identifierHash: hash,
          organisationId,
          state: { in: [...OPEN_STATES] },
          ...notMine,
        },
      }),
    ]);
    return membership !== null || open !== null;
  }

  // --- applying -------------------------------------------------------------------------------

  private async applyRow(
    row: PlannedRow,
    batchId: string,
    organisationId: string,
    actorUserId: string,
    unusablePassword: string,
  ): Promise<void> {
    const record = row.record!;
    const today = todayInIsrael();
    const identifier = record.identifier
      ? {
          identifierEnc: this.cipher.encrypt(record.identifier),
          identifierHash: row.identifierHash,
        }
      : {};
    let newUserId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      const type = await tx.membershipType.findUniqueOrThrow({
        where: { organisationId_key: { organisationId, key: record.typeKey } },
      });
      let userId: string;
      if (row.action === 'CREATE_ACCOUNT') {
        userId = uuidv7();
        newUserId = userId;
        await tx.user.create({
          data: {
            id: userId,
            email: record.email,
            passwordHash: unusablePassword,
            // The organisation vouches for the address; the setup link proves it again.
            emailVerifiedAt: new Date(),
            locale: record.locale,
          },
        });
      } else {
        userId = (await tx.user.findUniqueOrThrow({ where: { email: record.email } })).id;
      }

      // Names fill an empty profile; they never overwrite what the member wrote.
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) {
        await tx.profile.create({
          data: { userId, firstName: record.firstName, lastName: record.lastName },
        });
      } else if (!profile.firstName || !profile.lastName) {
        await tx.profile.update({
          where: { userId },
          data: {
            firstName: profile.firstName ?? record.firstName,
            lastName: profile.lastName ?? record.lastName,
          },
        });
      }

      // Whoever an organisation brings in as a member is known to the platform as a physician
      // (or what the type says).
      await tx.user.updateMany({
        where: { id: userId, verifiedAt: null },
        data: { verifiedAt: new Date(), verifiedAs: verifiedAsFor(type) },
      });

      const details = { batch: batchId, type: type.key, endDate: isoDate(record.endDate) };
      const existing = await tx.membership.findUnique({
        where: { userId_organisationId: { userId, organisationId } },
      });
      if (!existing) {
        const id = uuidv7();
        await tx.membership.create({
          data: {
            id,
            userId,
            organisationId,
            typeId: type.id,
            status: 'ACTIVE',
            startDate: today,
            endDate: record.endDate,
            paymentStatus: record.paymentStatus ?? 'NOT_REQUIRED',
            source: 'IMPORT',
            ...identifier,
          },
        });
        await recordHistory(tx, {
          membershipId: id,
          event: 'IMPORTED',
          fromStatus: null,
          toStatus: 'ACTIVE',
          details,
          changedBy: actorUserId,
        });
        return;
      }
      const lapsed = existing.endDate < today;
      await tx.membership.update({
        where: { id: existing.id },
        data: {
          typeId: type.id,
          endDate: record.endDate,
          ...(lapsed || existing.startDate > record.endDate ? { startDate: today } : {}),
          ...(record.paymentStatus ? { paymentStatus: record.paymentStatus } : {}),
          ...identifier,
        },
      });
      await recordHistory(tx, {
        membershipId: existing.id,
        event: 'IMPORTED',
        fromStatus: existing.status === 'SUSPENDED' ? 'SUSPENDED' : lapsed ? 'EXPIRED' : 'ACTIVE',
        toStatus: existing.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        details: { ...details, changes: row.changes.join(',') },
        changedBy: actorUserId,
      });
    });

    if (newUserId) await this.sendSetupEmail(newUserId, record, organisationId);
  }

  private async sendSetupEmail(
    userId: string,
    record: ImportRecord,
    organisationId: string,
  ): Promise<void> {
    const token = await this.tokens.issue(userId, 'ACCOUNT_SETUP');
    const link = new URL(`/${record.locale}/reset-password`, this.env.APP_BASE_URL);
    link.searchParams.set('token', token);
    const type = await this.prisma.membershipType.findUniqueOrThrow({
      where: { organisationId_key: { organisationId, key: record.typeKey } },
    });
    await this.mailer.send({
      to: record.email,
      locale: record.locale,
      template: 'membershipImportWelcome',
      params: {
        typeName: record.locale === 'he' ? type.nameHe : type.nameEn,
        link: link.toString(),
      },
    });
  }

  // --- helpers ----------------------------------------------------------------------------------

  private contentHash(csv: string): string {
    return this.hasher.hash(`membership-import:${csv}`);
  }

  private async record(
    action: string,
    batchId: string,
    actorUserId: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'import_batch',
      entityId: batchId,
      changes,
    });
  }
}

function totals(rows: { action: ImportAction }[]): ImportReport['totals'] {
  const counts = Object.fromEntries(IMPORT_ACTIONS.map((a) => [a, 0])) as ImportReport['totals'];
  for (const row of rows) counts[row.action] += 1;
  return counts;
}

const rule = (kind: 'CONFLICT' | 'BUSINESS_RULE_VIOLATION', code: string) =>
  new AppException(kind, [{ code }]);
