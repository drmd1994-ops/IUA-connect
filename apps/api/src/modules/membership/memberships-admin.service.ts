import { Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { covers, organisationWhere, reachedIn, scopeOf } from '../../common/auth/scope';
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
  MEMBERSHIP_PARTS,
  MembershipsService,
  describe,
  effectiveStatus,
  historyEntry,
  recordHistory,
} from './memberships.service';
import { OPEN_STATES } from './workflow';
import { isoDate, renewedEndDate, todayInIsrael } from './period';

const INCLUDE = {
  ...MEMBERSHIP_PARTS,
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
 * Manual membership management for an organisation's staff (M2 plan §3.5): create, renew,
 * suspend, reinstate, expire, payment status (set by hand, D4). Every change appends to the
 * history and the audit log.
 *
 * A membership belongs to an organisation, and so does the right to see or change it (M16): a
 * membership of another organisation reads as "not found". Platform staff reach one only with
 * `organisations.access`, and reading a member's file that way is written to the audit log.
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

  async list(principal: Principal, query: MembershipListQueryDto): Promise<AdminMembershipListDto> {
    const today = todayInIsrael();
    const scope = scopeOf(principal, 'membership.read');
    if (query.organisation && !covers(scope, query.organisation)) {
      throw new AppException('NOT_FOUND');
    }
    const where: Prisma.MembershipWhereInput = {
      ...organisationWhere(scope),
      ...(query.organisation ? { organisationId: query.organisation } : {}),
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

  async detail(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    const row = await this.prisma.membership.findUnique({
      where: { id },
      include: { ...INCLUDE, history: { orderBy: { at: 'desc' } } },
    });
    const scope = scopeOf(principal, 'membership.read');
    if (!row || !covers(scope, row.organisationId)) throw new AppException('NOT_FOUND');
    if (reachedIn(scope, row.organisationId)) {
      // Platform staff opened a member's file of an organisation they are not staff of.
      await this.record('membership.support.read', id, principal.userId, meta, {
        organisation: row.organisationId,
      });
    }
    return this.describeRow(row);
  }

  private describeRow(
    row: Row & { history: Parameters<typeof historyEntry>[0][] },
  ): AdminMembershipDetailDto {
    return { membership: view(row, todayInIsrael()), history: row.history.map(historyEntry) };
  }

  /** The membership as it is now, for the answer to a change the caller was allowed to make. */
  private async after(id: string): Promise<AdminMembershipDetailDto> {
    return this.describeRow(
      await this.prisma.membership.findUniqueOrThrow({
        where: { id },
        include: { ...INCLUDE, history: { orderBy: { at: 'desc' } } },
      }),
    );
  }

  async create(
    input: CreateMembershipDto,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    const actorUserId = principal.userId;
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new AppException('NOT_FOUND', [{ field: 'email', code: 'userNotFound' }]);
    const type = await this.prisma.membershipType.findFirst({
      where: { id: input.typeId, active: true },
    });
    // A type of an organisation the caller is not staff of is, for them, no type at all.
    if (!type || !covers(scopeOf(principal, 'membership.manage'), type.organisationId)) {
      throw invalid('typeId', 'unknownMembershipType');
    }
    const mine = { userId: user.id, organisationId: type.organisationId };
    const identifier = checkIdentifier(type.identifier, input.identifier);
    if (!identifier.ok) throw invalid('identifier', identifier.code);
    if (await this.prisma.membership.findUnique({ where: { userId_organisationId: mine } })) {
      throw new AppException('CONFLICT', [{ field: 'email', code: 'membershipExists' }]);
    }
    const hash = identifier.value
      ? this.hasher.hash(identifierHashInput(type.identifier, identifier.value))
      : null;
    if (hash) {
      const openElsewhere = await this.prisma.verificationRequest.findFirst({
        where: {
          identifierHash: hash,
          organisationId: type.organisationId,
          state: { in: [...OPEN_STATES] },
          userId: { not: user.id },
        },
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
    const created = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_organisationId: mine },
    });
    await this.record('membership.admin.create', created.id, actorUserId, meta, {
      type: type.key,
      identifierProvided: hash !== null,
    });
    return this.after(created.id);
  }

  renew(id: string, reason: string | undefined, actor: Principal, meta: RequestMeta) {
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

  suspend(id: string, reason: string, actor: Principal, meta: RequestMeta) {
    return this.change(id, reason, actor, meta, (row) => {
      if (row.status === 'SUSPENDED') throw rule('alreadySuspended');
      return { event: 'SUSPENDED', data: { status: 'SUSPENDED' }, toStatus: () => 'SUSPENDED' };
    });
  }

  reinstate(id: string, reason: string | undefined, actor: Principal, meta: RequestMeta) {
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
  expire(id: string, reason: string | undefined, actor: Principal, meta: RequestMeta) {
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
    actor: Principal,
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
    principal: Principal,
    meta: RequestMeta,
    plan: (row: Row, today: Date) => Change,
  ): Promise<AdminMembershipDetailDto> {
    const actorUserId = principal.userId;
    const row = await this.prisma.membership.findUnique({ where: { id }, include: INCLUDE });
    if (!row || !covers(scopeOf(principal, 'membership.manage'), row.organisationId)) {
      throw new AppException('NOT_FOUND');
    }
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
    return this.after(id);
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
