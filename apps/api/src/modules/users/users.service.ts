import { Injectable } from '@nestjs/common';
import { type PermissionKey, isPermissionKey, uuidv7 } from '@iua/shared';
import { type Locale } from '@iua/i18n';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { type User } from '../../generated/prisma/client';

/** Automatic lockout (SECURITY_MODEL.md §3): 5 failures → 15 min, doubling per lock, max 24 h. */
export const LOCKOUT_POLICY = {
  maxFailedAttempts: 5,
  baseMinutes: 15,
  maxMinutes: 24 * 60,
} as const;

export function lockoutMinutes(previousLockouts: number): number {
  return Math.min(LOCKOUT_POLICY.baseMinutes * 2 ** previousLockouts, LOCKOUT_POLICY.maxMinutes);
}

export interface AccessProfile {
  roles: {
    key: string;
    requiresMfa: boolean;
    permissions: PermissionKey[];
    /** The organisation the role is held in; null when it is held on the platform. */
    organisationId: string | null;
  }[];
  /** Holds at least one role that requires MFA. */
  requiresMfa: boolean;
}

export type FailedLoginResult = { locked: false } | { locked: true; minutes: number };

/** Account records, roles and permissions (the users module owns these tables). */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: { email: string; passwordHash: string; locale: Locale }): Promise<User> {
    return this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        locale: input.locale,
      },
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  isLocked(user: User, now = new Date()): boolean {
    return user.status === 'LOCKED' || (user.lockedUntil !== null && user.lockedUntil > now);
  }

  /**
   * Counts a failed sign-in and locks the account (with backoff) when the limit is reached.
   * The increment is atomic and the lock is conditional, so parallel attempts can't slip past it.
   */
  async recordFailedLogin(user: User, now = new Date()): Promise<FailedLoginResult> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true, lockoutCount: true },
    });
    if (updated.failedLoginCount < LOCKOUT_POLICY.maxFailedAttempts) return { locked: false };

    const minutes = lockoutMinutes(updated.lockoutCount);
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, failedLoginCount: { gte: LOCKOUT_POLICY.maxFailedAttempts } },
      data: {
        failedLoginCount: 0,
        lockoutCount: { increment: 1 },
        lockedUntil: new Date(now.getTime() + minutes * 60_000),
      },
    });
    // count 0: a parallel request applied this lock already.
    return count === 1 ? { locked: true, minutes } : { locked: false };
  }

  async recordSuccessfulLogin(userId: string, newPasswordHash?: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockoutCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}),
      },
    });
  }

  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockoutCount: 0, lockedUntil: null },
    });
  }

  async setLocale(userId: string, locale: Locale): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { locale } });
  }

  /** Roles and their permissions for a user (permission filtering by MFA happens in auth). */
  async accessProfile(userId: string): Promise<AccessProfile> {
    const grants = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        organisationId: true,
        role: {
          select: {
            key: true,
            requiresMfa: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    const roles = grants.map(({ role, organisationId }) => ({
      organisationId,
      key: role.key,
      requiresMfa: role.requiresMfa,
      permissions: role.permissions.map((p) => p.permission.key).filter(isPermissionKey),
    }));
    return { roles, requiresMfa: roles.some((role) => role.requiresMfa) };
  }

  /**
   * Grants a role without a department scope (idempotent), on the platform or, when an
   * organisation is named, inside it.
   */
  async grantRole(
    userId: string,
    roleKey: string,
    grantedBy: string | null,
    organisationId: string | null = null,
  ): Promise<void> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const existing = await this.prisma.userRole.findFirst({
      where: { userId, roleId: role.id, scopeType: 'NONE', organisationId },
    });
    if (existing) return;
    await this.prisma.userRole.create({
      data: { id: uuidv7(), userId, roleId: role.id, scopeType: 'NONE', grantedBy, organisationId },
    });
  }
}
