import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { FieldCipher, SecretHasher } from '../../infra/crypto/secrets';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { checkIdentifier, identifierHashInput } from './identifier';
import {
  type AdminMembershipDetailDto,
  type AdminMembershipDto,
  type AdminMembershipListDto,
  type CreateMembershipDto,
  type MembershipListQueryDto,
} from './memberships-admin.dto';
import {
  type EffectiveStatus,
  type HistoryEvent,
  MembershipsService,
  describe,
  effectiveStatus,
  historyEntry,
  recordHistory,
} from './memberships.service';
import { OPEN_STATES } from './workflow';
import { isoDate, renewedEndDate, todayInIsrael } from './period';

const INCLUDE = {
  type: true,
  user: { select: { id: true, email: true, profile: true } },
} satisfies Prisma.MembershipInclude;

type Row = Prisma.MembershipGetPayload<{ include: typeof INCLUDE }>;

type Payment = AdminMembershipDto['paymentStatus'];

/** An admin action: what it changes, given the membership and today's date. */
interface Change {
  event: HistoryEvent;
  data: Prisma.MembershipUpdateManyMutationInput;
  toStatus: (today: Date) => EffectiveStatus;
  details?: Record<string, string>;
}

/**
 * Manual membership management for IUA admins (M2 plan §3.5): create, renew, suspend,
 * reinstate, expire, payment status (set by hand, D4). Every change appends to the history and
 * the audit log.
 */
@Injectable()
export class MembershipsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly cipher: FieldCipher,
    private readonly hasher: SecretHasher,
    private readonly audit: AuditService,
  ) {}

  async list(query: MembershipListQueryDto): Promise<AdminMembershipListDto> {
    const today = todayInIsrael();
    const where: Prisma.MembershipWhereInput = {
      ...(query.status === 'ACTIVE' ? { status: 'ACTIVE', endDate: { gte: today } } : {}),
      ...(query.status === 'EXPIRED' ? { status: 'ACTIVE', endDate: { lt: today } } : {}),
      ...(query.status === 'SUSPENDED' ? { status: 'SUSPENDED' } : {}),
      ...(query.type ? { type: { key: query.type } } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.q ? { user: { OR: searchUser(query.q) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return {
      items: rows.map((row) => view(row, today)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async detail(id: string): Promise<AdminMembershipDetailDto> {
    const row = await this.prisma.membership.findUnique({
      where: { id },
      include: { ...INCLUDE, history: { orderBy: { at: 'desc' } } },
    });
    if (!row) throw new AppException('NOT_FOUND');
    return { membership: view(row, todayInIsrael()), history: row.history.map(historyEntry) };
  }

  async create(
    input: CreateMembershipDto,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppException('NOT_FOUND', [{ field: 'email', code: 'userNotFound' }]);
    const type = await this.prisma.membershipType.findFirst({
      where: { id: input.typeId, active: true },
    });
    if (!type) throw invalid('typeId', 'unknownMembershipType');
    const identifier = checkIdentifier(type.identifier, input.identifier);
    if (!identifier.ok) throw invalid('identifier', identifier.code);
    if (await this.prisma.membership.findUnique({ where: { userId: user.id } })) {
      throw new AppException('CONFLICT', [{ field: 'email', code: 'membershipExists' }]);
    }
    const hash = identifier.value
      ? this.hasher.hash(identifierHashInput(type.identifier, identifier.value))
      : null;
    if (hash) {
      const openElsewhere = await this.prisma.verificationRequest.findFirst({
        where: { identifierHash: hash, state: { in: [...OPEN_STATES] }, userId: { not: user.id } },
      });
      if (openElsewhere) throw IDENTIFIER_IN_USE();
    }

    try {
      await this.prisma.$transaction((tx) =>
        this.memberships.grant(tx, {
          userId: user.id,
          typeId: type.id,
          identifierEnc: identifier.value ? this.cipher.encrypt(identifier.value) : null,
          identifierHash: hash,
          changedBy: actorUserId,
          source: 'MANUAL',
          reason: input.reason || null,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error, 'identifier_hash')) throw IDENTIFIER_IN_USE();
      if (isUniqueViolation(error)) {
        throw new AppException('CONFLICT', [{ field: 'email', code: 'membershipExists' }]);
      }
      throw error;
    }
    const created = await this.prisma.membership.findUniqueOrThrow({ where: { userId: user.id } });
    await this.record('membership.admin.create', created.id, actorUserId, meta, {
      type: type.key,
      identifierProvided: hash !== null,
    });
    return this.detail(created.id);
  }

  renew(id: string, reason: string | undefined, actor: string, meta: RequestMeta) {
    return this.change(id, reason, actor, meta, (row, today) => {
      const endDate = renewedEndDate(row.endDate, today);
      const lapsed = row.endDate < today;
      return {
        event: 'RENEWED',
        data: { endDate, ...(lapsed ? { startDate: today } : {}) },
        toStatus: () => (row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'),
        details: { endDate: isoDate(endDate) },
      };
    });
  }

  suspend(id: string, reason: string, actor: string, meta: RequestMeta) {
    return this.change(id, reason, actor, meta, (row) => {
      if (row.status === 'SUSPENDED') throw rule('alreadySuspended');
      return { event: 'SUSPENDED', data: { status: 'SUSPENDED' }, toStatus: () => 'SUSPENDED' };
    });
  }

  reinstate(id: string, reason: string | undefined, actor: string, meta: RequestMeta) {
    return this.change(id, reason, actor, meta, (row) => {
      if (row.status !== 'SUSPENDED') throw rule('notSuspended');
      return {
        event: 'REINSTATED',
        data: { status: 'ACTIVE' },
        toStatus: (today) => effectiveStatus({ status: 'ACTIVE', endDate: row.endDate }, today),
      };
    });
  }

  /** Ends the membership as of yesterday, so it shows as expired from today. */
  expire(id: string, reason: string | undefined, actor: string, meta: RequestMeta) {
    return this.change(id, reason, actor, meta, (row, today) => {
      if (effectiveStatus(row, today) === 'EXPIRED') throw rule('alreadyExpired');
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return {
        event: 'EXPIRED',
        data: {
          endDate: yesterday,
          ...(row.startDate > yesterday ? { startDate: yesterday } : {}),
        },
        toStatus: () => (row.status === 'SUSPENDED' ? 'SUSPENDED' : 'EXPIRED'),
        details: { endDate: isoDate(yesterday) },
      };
    });
  }

  setPaymentStatus(
    id: string,
    paymentStatus: Payment,
    reason: string | undefined,
    actor: string,
    meta: RequestMeta,
  ) {
    return this.change(id, reason, actor, meta, (row, today) => {
      if (row.paymentStatus === paymentStatus) throw rule('paymentStatusUnchanged');
      return {
        event: 'PAYMENT_STATUS_CHANGED',
        data: { paymentStatus },
        toStatus: () => effectiveStatus(row, today),
        details: { from: row.paymentStatus, to: paymentStatus },
      };
    });
  }

  // --- internals ------------------------------------------------------------------------------

  /**
   * Applies one change: the update only lands if the row is still as read (otherwise someone
   * else changed it first), then history and audit.
   */
  private async change(
    id: string,
    reason: string | undefined,
    actorUserId: string,
    meta: RequestMeta,
    plan: (row: Row, today: Date) => Change,
  ): Promise<AdminMembershipDetailDto> {
    const row = await this.prisma.membership.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    const today = todayInIsrael();
    const change = plan(row, today);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.membership.updateMany({
        where: { id, updatedAt: row.updatedAt },
        data: change.data,
      });
      if (count === 0) throw new AppException('CONFLICT', [{ code: 'membershipChanged' }]);
      await recordHistory(tx, {
        membershipId: id,
        event: change.event,
        fromStatus: effectiveStatus(row, today),
        toStatus: change.toStatus(today),
        ...(change.details ? { details: change.details } : {}),
        changedBy: actorUserId,
        reason: reason || null,
      });
    });
    await this.record(
      `membership.admin.${change.event.toLowerCase()}`,
      id,
      actorUserId,
      meta,
      change.details ?? {},
    );
    return this.detail(id);
  }

  private async record(
    action: string,
    membershipId: string,
    actorUserId: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId,
      actorIp: meta.ip,
      entityType: 'membership',
      entityId: membershipId,
      changes,
    });
  }
}

function searchUser(q: string): Prisma.UserWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' as const };
  return [
    { email: contains },
    { profile: { firstName: contains } },
    { profile: { lastName: contains } },
    { profile: { nameHe: contains } },
    { profile: { nameEn: contains } },
  ];
}

function view(row: Row, today: Date): AdminMembershipDto {
  const profile = row.user.profile;
  return {
    ...describe(row, today),
    member: {
      userId: row.user.id,
      email: row.user.email,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      nameHe: profile?.nameHe ?? null,
      nameEn: profile?.nameEn ?? null,
    },
    source: row.source,
    identifierOnFile: row.identifierHash !== null,
  };
}

const invalid = (field: string, code: string) =>
  new AppException('VALIDATION_FAILED', [{ field, code }]);

const rule = (code: string) => new AppException('BUSINESS_RULE_VIOLATION', [{ code }]);

const IDENTIFIER_IN_USE = () =>
  new AppException('CONFLICT', [{ field: 'identifier', code: 'identifierInUse' }]);
