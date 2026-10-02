import { Injectable, Logger } from '@nestjs/common';
import { type PermissionKey, uuidv7 } from '@iua/shared';
import { type Request } from 'express';
import { type Principal, PrincipalResolver } from '../../common/auth/principal';
import { type RequestMeta } from '../../common/request-meta';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretHasher, randomToken } from '../../infra/crypto/secrets';
import { type Session } from '../../generated/prisma/client';
import { AuditService } from '../audit';
import { type AccessProfile, UsersService } from '../users';
import { AccessTokenService } from './access-token.service';
import { ACTIVITY_WRITE_INTERVAL_SEC, SESSION_POLICY, type SessionKind } from './session-policy';

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  /** Opaque; goes only into the HttpOnly cookie. */
  refreshToken: string;
  sessionId: string;
  sessionExpiresAt: Date;
}

export type RevokeReason =
  | 'logout'
  | 'user_revoked'
  | 'idle'
  | 'refresh_reuse'
  | 'password_changed'
  | 'password_reset'
  | 'account_disabled'
  /** An administrator ended the person's sessions (M8). */
  | 'admin_revoked';

/** Permissions a session actually holds: MFA-requiring roles count only after MFA. */
export function effectivePermissions(profile: AccessProfile, mfa: boolean): Set<PermissionKey> {
  const permissions = new Set<PermissionKey>();
  for (const role of profile.roles) {
    if (role.requiresMfa && !mfa) continue;
    for (const permission of role.permissions) permissions.add(permission);
  }
  return permissions;
}

/**
 * Sessions and rotating refresh tokens (SECURITY_MODEL.md §3). Also the PrincipalResolver used by
 * the global permission guard: every request re-checks the session, so revocation is immediate.
 */
@Injectable()
export class SessionsService extends PrincipalResolver {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  /** Starts a session after a successful sign-in (and MFA, when `mfa` is true). */
  async create(input: {
    userId: string;
    deviceId: string | null;
    mfa: boolean;
    meta: RequestMeta;
  }): Promise<IssuedTokens> {
    const profile = await this.users.accessProfile(input.userId);
    const kind: SessionKind = profile.requiresMfa ? 'admin' : 'member';
    const policy = SESSION_POLICY[kind];
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        id: uuidv7(),
        userId: input.userId,
        deviceId: input.deviceId,
        ip: input.meta.ip,
        userAgent: input.meta.userAgent,
        mfaCompletedAt: input.mfa ? now : null,
        // Signing in counts as a fresh authentication for sensitive changes (REAUTH_WINDOW_SEC).
        reauthenticatedAt: now,
        lastSeenAt: now,
        idleTimeoutSec: policy.idleSec,
        expiresAt: new Date(now.getTime() + policy.absoluteSec * 1000),
      },
    });
    const { token: refreshToken } = await this.newRefreshToken(session);
    const access = await this.accessTokens.sign({
      userId: input.userId,
      sessionId: session.id,
      mfa: input.mfa,
    });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
    };
  }

  /**
   * Rotates a refresh token. A token that was already used means it leaked (or the client
   * misbehaved): the whole session is revoked and the event is audited (reuse detection).
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    const tokenHash = this.hasher.hash(refreshToken);
    const now = new Date();

    // Atomic claim: only one request can mark an unused token as used.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: now },
    });
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: true },
    });
    if (!token) throw new AppException('UNAUTHENTICATED');

    if (claimed.count === 0) {
      await this.revoke(token.session, 'refresh_reuse');
      await this.audit.record({
        action: 'auth.refresh.reuse_detected',
        entityType: 'session',
        entityId: token.sessionId,
        actorUserId: token.session.userId,
        actorIp: meta.ip,
        correlationId: meta.correlationId,
      });
      this.logger.warn(
        { sessionId: token.sessionId },
        'Refresh token reuse detected; session revoked',
      );
      throw new AppException('UNAUTHENTICATED');
    }

    const session = await this.ensureActive(token.session, now);
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.revoke(session, 'account_disabled');
      throw new AppException('UNAUTHENTICATED');
    }

    const next = await this.newRefreshToken(session);
    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { replacedBy: next.id },
    });
    await this.touch(session, now, true);
    const access = await this.accessTokens.sign({
      userId: session.userId,
      sessionId: session.id,
      mfa: session.mfaCompletedAt !== null,
    });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: next.token,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
    };
  }

  /** Session belonging to a refresh token, used or not (for logout). */
  async sessionForRefreshToken(refreshToken: string): Promise<Session | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hasher.hash(refreshToken) },
      include: { session: true },
    });
    return token?.session ?? null;
  }

  async revoke(session: Pick<Session, 'id'>, reason: RevokeReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Revokes all of a user's sessions, optionally keeping one (e.g. the current session). */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return count;
  }

  async markMfaCompleted(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { mfaCompletedAt: new Date(), reauthenticatedAt: new Date() },
    });
  }

  async markReauthenticated(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { reauthenticatedAt: new Date() },
    });
  }

  findById(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  /** Active sessions of a user, newest first. */
  listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  // --- PrincipalResolver ---------------------------------------------------

  async resolve(request: object): Promise<Principal | null> {
    const header = (request as Request).headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const claims = await this.accessTokens.verify(header.slice('Bearer '.length).trim());
    if (!claims) return null;

    const session = await this.prisma.session.findUnique({ where: { id: claims.sessionId } });
    if (!session || session.userId !== claims.userId) return null;
    try {
      await this.ensureActive(session, new Date());
    } catch {
      return null;
    }
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') return null;

    await this.touch(session, new Date());
    const mfa = session.mfaCompletedAt !== null;
    const profile = await this.users.accessProfile(user.id);
    const hasFactor =
      (await this.prisma.mfaFactor.count({
        where: { userId: user.id, confirmedAt: { not: null } },
      })) > 0;
    return {
      userId: user.id,
      sessionId: session.id,
      mfa,
      roles: profile.roles.map((role) => role.key),
      permissions: effectivePermissions(profile, mfa),
      mfaEnrollmentRequired: profile.requiresMfa && !hasFactor,
    };
  }

  // --- internals -------------------------------------------------------------

  /** Throws SESSION_EXPIRED (and revokes when idle) unless the session is still usable. */
  private async ensureActive(session: Session, now: Date): Promise<Session> {
    if (session.revokedAt) throw new AppException('SESSION_EXPIRED');
    if (session.expiresAt <= now) throw new AppException('SESSION_EXPIRED');
    if (now.getTime() - session.lastSeenAt.getTime() > session.idleTimeoutSec * 1000) {
      await this.revoke(session, 'idle');
      throw new AppException('SESSION_EXPIRED');
    }
    return session;
  }

  /** Records activity (at most once a minute unless forced). */
  private async touch(session: Session, now: Date, force = false): Promise<void> {
    const elapsed = now.getTime() - session.lastSeenAt.getTime();
    if (!force && elapsed < ACTIVITY_WRITE_INTERVAL_SEC * 1000) return;
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }

  private async newRefreshToken(session: Session): Promise<{ id: string; token: string }> {
    const token = randomToken();
    const id = uuidv7();
    await this.prisma.refreshToken.create({
      data: {
        id,
        sessionId: session.id,
        familyId: session.id,
        tokenHash: this.hasher.hash(token),
        expiresAt: session.expiresAt,
      },
    });
    return { id, token };
  }
}
