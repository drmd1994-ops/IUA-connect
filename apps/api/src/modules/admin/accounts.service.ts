import { Injectable } from '@nestjs/common';
import { type PermissionKey, ROLES, ROLE_KEYS, uuidv7 } from '@iua/shared';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit';
import { SessionsService } from '../auth';
import {
  type AccountProblem,
  disableProblem,
  manageProblem,
  roleChangeProblem,
} from './account-rules';
import {
  type AccountDto,
  type AccountListDto,
  type AccountListQueryDto,
  type RoleListDto,
} from './accounts.dto';

const INCLUDE = {
  profile: { select: { firstName: true, lastName: true } },
  roles: { include: { role: { select: { key: true } } }, orderBy: { grantedAt: 'asc' } },
  mfaFactors: { where: { confirmedAt: { not: null } }, select: { id: true } },
} satisfies Prisma.UserInclude;
type Row = Prisma.UserGetPayload<{ include: typeof INCLUDE }>;

/**
 * Accounts and roles in the admin area (M8 plan §2.2–2.3). It shows account facts and changes
 * the account's state and roles; it never shows or changes passwords, second factors or the
 * profile fields a member keeps private. Every change needs a reason and is audited.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AccountListQueryDto): Promise<AccountListDto> {
    const now = new Date();
    // Each filter is its own condition, and all of them must hold.
    const conditions: Prisma.UserWhereInput[] = [];
    if (query.q) {
      conditions.push({
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { profile: { firstName: { contains: query.q, mode: 'insensitive' } } },
          { profile: { lastName: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    // "Locked" is an account locked by an administrator, or locked now after failed sign-ins.
    if (query.status === 'LOCKED') {
      conditions.push({
        status: { not: 'DISABLED' },
        OR: [{ status: 'LOCKED' }, { lockedUntil: { gt: now } }],
      });
    } else if (query.status === 'ACTIVE') {
      conditions.push({
        status: 'ACTIVE',
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      });
    } else if (query.status) {
      conditions.push({ status: query.status });
    }
    if (query.role) conditions.push({ roles: { some: { role: { key: query.role } } } });
    const where: Prisma.UserWhereInput = { AND: conditions };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: rows.map((row) => summary(row, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AccountDto> {
    const now = new Date();
    const [row, openSessions, membership] = await Promise.all([
      this.row(id),
      this.prisma.session.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
      }),
      this.prisma.membership.findUnique({
        where: { userId: id },
        select: { id: true, status: true, endDate: true, type: { select: { key: true } } },
      }),
    ]);
    return {
      ...summary(row, now),
      lockedUntil: row.lockedUntil && row.lockedUntil > now ? row.lockedUntil.toISOString() : null,
      openSessions,
      roleGrants: row.roles.map((grant) => ({
        role: grant.role.key,
        scope: grant.scopeType,
        grantedAt: grant.grantedAt.toISOString(),
        removable: grant.scopeType === 'NONE',
      })),
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            typeKey: membership.type.key,
            endDate: membership.endDate.toISOString().slice(0, 10),
          }
        : null,
    };
  }

  /** A disabled account can't sign in, and its sessions end at once. */
  async disable(
    id: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(disableProblem(actorOf(principal), targetOf(row), await this.activeSuperAdmins()));
    if (row.status !== 'DISABLED') {
      await this.prisma.user.update({ where: { id }, data: { status: 'DISABLED' } });
      const ended = await this.sessions.revokeAllForUser(id, 'account_disabled');
      await this.record('account.disable', id, principal, meta, { reason, sessionsEnded: ended });
    }
    return this.get(id);
  }

  async enable(
    id: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(manageProblem(actorOf(principal), targetOf(row)));
    if (row.status === 'DISABLED') {
      await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.record('account.enable', id, principal, meta, { reason });
    }
    return this.get(id);
  }

  /** Ends a lock, whether it came from failed sign-ins or from an administrator. */
  async unlock(
    id: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(manageProblem(actorOf(principal), targetOf(row)));
    if (row.status === 'DISABLED') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'accountIsDisabled' }]);
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', failedLoginCount: 0, lockoutCount: 0, lockedUntil: null },
    });
    await this.record('account.unlock', id, principal, meta, { reason });
    return this.get(id);
  }

  /** Signs the person out everywhere. They can sign in again. */
  async endSessions(
    id: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(manageProblem(actorOf(principal), targetOf(row)));
    const ended = await this.sessions.revokeAllForUser(id, 'admin_revoked');
    await this.record('account.sessions.end', id, principal, meta, {
      reason,
      sessionsEnded: ended,
    });
    return this.get(id);
  }

  // --- Roles ----------------------------------------------------------------------------------

  /** The roles and what each one may do. Roles are fixed in code; this only shows them. */
  async roles(): Promise<RoleListDto> {
    const counts = await this.prisma.userRole.groupBy({
      by: ['roleId'],
      _count: { userId: true },
    });
    const roles = await this.prisma.role.findMany({ select: { id: true, key: true } });
    const holders = new Map(
      roles.map((role) => [
        role.key,
        counts.find((count) => count.roleId === role.id)?._count.userId ?? 0,
      ]),
    );
    return {
      items: ROLE_KEYS.map((key) => ({
        key,
        requiresTwoStep: ROLES[key].requiresMfa,
        scope: ROLES[key].scope,
        permissions: [...ROLES[key].permissions] as PermissionKey[],
        holders: holders.get(key) ?? 0,
      })),
    };
  }

  async grantRole(
    id: string,
    role: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(
      roleChangeProblem(
        'grant',
        role,
        actorOf(principal),
        targetOf(row),
        await this.activeSuperAdmins(),
      ),
    );
    if (!row.roles.some((grant) => grant.role.key === role && grant.scopeType === 'NONE')) {
      const found = await this.prisma.role.findUniqueOrThrow({ where: { key: role } });
      await this.prisma.userRole.create({
        data: {
          id: uuidv7(),
          userId: id,
          roleId: found.id,
          scopeType: 'NONE',
          grantedBy: principal.userId,
        },
      });
      await this.record('account.role.grant', id, principal, meta, { role, reason });
    }
    return this.get(id);
  }

  async removeRole(
    id: string,
    role: string,
    reason: string,
    principal: Principal,
    meta: RequestMeta,
  ): Promise<AccountDto> {
    const row = await this.row(id);
    this.refuse(
      roleChangeProblem(
        'remove',
        role,
        actorOf(principal),
        targetOf(row),
        await this.activeSuperAdmins(),
      ),
    );
    const { count } = await this.prisma.userRole.deleteMany({
      where: { userId: id, scopeType: 'NONE', role: { key: role } },
    });
    if (count > 0) {
      // What the person may do changes on their next request; ending the sessions makes sure
      // nothing stays open under the old role.
      await this.sessions.revokeAllForUser(id, 'admin_revoked');
      await this.record('account.role.remove', id, principal, meta, { role, reason });
    }
    return this.get(id);
  }

  // --- Internals ------------------------------------------------------------------------------

  private async row(id: string): Promise<Row> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppException('NOT_FOUND');
    return row;
  }

  /** Super admins whose accounts can be used. */
  private activeSuperAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: {
        status: { not: 'DISABLED' },
        roles: { some: { role: { key: 'SUPER_ADMIN' } } },
      },
    });
  }

  private refuse(problem: AccountProblem | null): void {
    if (!problem) return;
    if (problem === 'roleUnknown' || problem === 'roleScoped') {
      throw new AppException('VALIDATION_FAILED', [{ field: 'role', code: problem }]);
    }
    if (problem === 'accountSuperAdmin') throw new AppException('FORBIDDEN', [{ code: problem }]);
    throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: problem }]);
  }

  private record(
    action: string,
    id: string,
    principal: Principal,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ): Promise<string> {
    return this.audit.record({
      action,
      correlationId: meta.correlationId,
      actorUserId: principal.userId,
      actorIp: meta.ip,
      entityType: 'user',
      entityId: id,
      changes,
    });
  }
}

const actorOf = (principal: Principal) => ({ userId: principal.userId, roles: principal.roles });
const targetOf = (row: Row) => ({
  userId: row.id,
  roles: row.roles.map((grant) => grant.role.key),
});

function summary(row: Row, now: Date) {
  const name = [row.profile?.firstName, row.profile?.lastName].filter(Boolean).join(' ');
  return {
    id: row.id,
    email: row.email,
    name: name || null,
    status: row.status,
    lockedNow: row.status === 'LOCKED' || (row.lockedUntil !== null && row.lockedUntil > now),
    emailVerified: row.emailVerifiedAt !== null,
    roles: [...new Set(row.roles.map((grant) => grant.role.key))],
    twoStep: row.mfaFactors.length > 0,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
