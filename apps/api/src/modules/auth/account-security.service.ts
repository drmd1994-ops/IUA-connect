import { Injectable } from '@nestjs/common';
import { type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { type Principal } from '../../common/auth/principal';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PasswordHasher } from '../../infra/crypto/password-hasher';
import { Mailer } from '../../infra/mailer/mailer';
import { AuditService } from '../audit';
import { UsersService } from '../users';
import { AuthTokensService } from './auth-tokens.service';
import { AuthService, assertPasswordPolicy, userLocale } from './auth.service';
import { DevicesService } from './devices.service';
import { type TotpEnrollment, MfaService } from './mfa.service';
import { PasskeysService } from './passkeys.service';
import { MFA_CHALLENGE_MAX_ATTEMPTS, REAUTH_WINDOW_SEC } from './session-policy';
import { type IssuedTokens, SessionsService } from './sessions.service';

/**
 * MFA, re-authentication and password changes (SECURITY_MODEL.md §3). Sensitive changes need a
 * password re-entry (plus a code when MFA is on) within the last few minutes; signing in counts.
 */
@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokensService,
    private readonly sessions: SessionsService,
    private readonly devices: DevicesService,
    private readonly mfa: MfaService,
    private readonly passkeys: PasskeysService,
    private readonly auth: AuthService,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  // --- second sign-in step -----------------------------------------------------

  /** Exchanges the MFA challenge from /auth/login and a code for a session with mfa=true. */
  async completeMfaLogin(
    mfaToken: string,
    code: string,
    deviceCookie: string | undefined,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const challenge = await this.tokens.find(mfaToken, 'MFA_CHALLENGE');
    if (!challenge) throw new AppException('INVALID_TOKEN');

    const check = await this.mfa.verify(challenge.userId, code);
    if (!check.ok) {
      const left = await this.tokens.recordFailedAttempt(challenge.id, MFA_CHALLENGE_MAX_ATTEMPTS);
      await this.record('auth.mfa.challenge_failed', challenge.userId, meta, {
        attemptsLeft: left,
      });
      throw new AppException(left > 0 ? 'MFA_INVALID_CODE' : 'INVALID_TOKEN');
    }
    if (!(await this.tokens.consume(mfaToken, 'MFA_CHALLENGE'))) {
      throw new AppException('INVALID_TOKEN');
    }

    const tokens = await this.sessions.create({
      userId: challenge.userId,
      deviceId: await this.devices.findForUser(challenge.userId, deviceCookie),
      mfa: true,
      meta,
    });
    if (check.method === 'recovery') {
      await this.record('auth.mfa.recovery_code_used', challenge.userId, meta, {
        remaining: await this.mfa.remainingRecoveryCodes(challenge.userId),
      });
    }
    await this.record(
      'auth.login.success',
      challenge.userId,
      meta,
      { mfa: check.method },
      {
        entityType: 'session',
        entityId: tokens.sessionId,
      },
    );
    return tokens;
  }

  // --- re-authentication ---------------------------------------------------------

  /**
   * Confirms identity for sensitive changes: the password plus a code when an authenticator app
   * is enrolled, or a passkey. An account with passkeys but no app must use a passkey: the
   * password alone would be weaker than its normal sign-in.
   */
  async reauthenticate(
    principal: Principal,
    input: { password: string; code?: string } | { passkey: AuthenticationResponseJSON },
    meta: RequestMeta,
  ): Promise<void> {
    if ('passkey' in input) {
      const check = await this.passkeys.verify(input.passkey);
      if (!check.ok || check.factor.userId !== principal.userId) {
        await this.record('auth.reauth.failed', principal.userId, meta, { method: 'passkey' });
        throw new AppException('PASSKEY_INVALID');
      }
    } else {
      const user = await this.users.findById(principal.userId);
      if (!user || !(await this.passwords.verify(user.passwordHash, input.password))) {
        await this.record('auth.reauth.failed', principal.userId, meta);
        throw new AppException('INVALID_CREDENTIALS');
      }
      if (await this.mfa.hasConfirmedFactor(user.id)) {
        const check = input.code ? await this.mfa.verify(user.id, input.code) : { ok: false };
        if (!check.ok) {
          await this.record('auth.reauth.failed', principal.userId, meta);
          throw new AppException('MFA_INVALID_CODE');
        }
      } else if ((await this.passkeys.list(user.id)).length > 0) {
        throw new AppException('MFA_INVALID_CODE', [
          { field: 'passkey', code: 'PASSKEY_REQUIRED' },
        ]);
      }
    }
    await this.sessions.markReauthenticated(principal.sessionId);
    await this.record('auth.reauthenticated', principal.userId, meta);
  }

  /** Throws REAUTHENTICATION_REQUIRED unless identity was confirmed in the last few minutes. */
  async assertRecentAuthentication(principal: Principal): Promise<void> {
    const session = await this.sessions.findById(principal.sessionId);
    const at = session?.reauthenticatedAt?.getTime() ?? 0;
    if (Date.now() - at > REAUTH_WINDOW_SEC * 1000) {
      throw new AppException('REAUTHENTICATION_REQUIRED');
    }
  }

  // --- MFA management --------------------------------------------------------------

  async mfaStatus(principal: Principal) {
    const factor = await this.mfa.confirmedTotp(principal.userId);
    const profile = await this.users.accessProfile(principal.userId);
    const passkeys = (await this.passkeys.list(principal.userId)).length;
    return {
      enabled: factor !== null,
      ...(factor ? { factorId: factor.id } : {}),
      recoveryCodesRemaining: factor ? await this.mfa.remainingRecoveryCodes(principal.userId) : 0,
      requiredByRole: profile.requiresMfa,
      canDisable: !profile.requiresMfa || passkeys > 0,
    };
  }

  async startTotp(principal: Principal): Promise<TotpEnrollment> {
    await this.assertRecentAuthentication(principal);
    const user = await this.users.findById(principal.userId);
    if (!user) throw new AppException('UNAUTHENTICATED');
    return this.mfa.startTotp(user.id, user.email);
  }

  /** Confirms enrolment; this session counts as MFA-verified from now on. */
  async confirmTotp(
    principal: Principal,
    factorId: string,
    code: string,
    meta: RequestMeta,
  ): Promise<string[]> {
    const recoveryCodes = await this.mfa.confirmTotp(principal.userId, factorId, code);
    await this.sessions.markMfaCompleted(principal.sessionId);
    await this.record('auth.mfa.enrolled', principal.userId, meta, { type: 'TOTP' });
    return recoveryCodes;
  }

  async disableMfa(principal: Principal, factorId: string, meta: RequestMeta): Promise<void> {
    await this.assertRecentAuthentication(principal);
    const profile = await this.users.accessProfile(principal.userId);
    // A role that requires MFA may drop the app only while a passkey remains.
    if (profile.requiresMfa && (await this.passkeys.list(principal.userId)).length === 0) {
      throw new AppException('MFA_REQUIRED_BY_ROLE');
    }
    await this.mfa.disable(principal.userId, factorId);
    await this.record('auth.mfa.disabled', principal.userId, meta, { factorId });
  }

  async regenerateRecoveryCodes(principal: Principal, meta: RequestMeta): Promise<string[]> {
    await this.assertRecentAuthentication(principal);
    if (!(await this.mfa.hasConfirmedFactor(principal.userId))) {
      throw new AppException('BUSINESS_RULE_VIOLATION');
    }
    const codes = await this.mfa.regenerateRecoveryCodes(principal.userId);
    await this.record('auth.mfa.recovery_codes_regenerated', principal.userId, meta);
    return codes;
  }

  // --- passwords ---------------------------------------------------------------------

  /** Changing the password proves identity itself; other sessions are signed out. */
  async changePassword(
    principal: Principal,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.users.findById(principal.userId);
    if (!user || !(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      await this.record('auth.password.change_failed', principal.userId, meta);
      throw new AppException('INVALID_CREDENTIALS');
    }
    assertPasswordPolicy(input.newPassword, user.email);
    await this.users.setPassword(user.id, await this.passwords.hash(input.newPassword));
    const revoked = await this.sessions.revokeAllForUser(
      user.id,
      'password_changed',
      principal.sessionId,
    );
    await this.sessions.markReauthenticated(principal.sessionId);
    await this.mailer.send({
      to: user.email,
      locale: userLocale(user),
      template: 'passwordChanged',
      params: {},
    });
    await this.record('auth.password.changed', user.id, meta, { otherSessionsRevoked: revoked });
  }

  /** Always succeeds from the caller's point of view (no account enumeration). */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') return;
    const token = await this.tokens.issue(user.id, 'PASSWORD_RESET');
    const locale = userLocale(user);
    await this.mailer.send({
      to: user.email,
      locale,
      template: 'passwordReset',
      params: { link: this.auth.link(locale, 'reset-password', token) },
    });
    await this.record('auth.password.reset_requested', user.id, meta, undefined, {
      actorUserId: null,
    });
  }

  /**
   * Sets a new password from an emailed link. All sessions are signed out; any lockout is cleared;
   * the address is proven, so it counts as verified. MFA stays enabled.
   */
  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const row = await this.tokens.find(token, 'PASSWORD_RESET');
    if (!row) throw new AppException('INVALID_TOKEN');
    const user = await this.users.findById(row.userId);
    if (!user || user.status !== 'ACTIVE') throw new AppException('INVALID_TOKEN');
    assertPasswordPolicy(newPassword, user.email); // before consuming, so a weak choice can be retried
    if (!(await this.tokens.consume(token, 'PASSWORD_RESET')))
      throw new AppException('INVALID_TOKEN');

    await this.users.setPassword(user.id, await this.passwords.hash(newPassword));
    await this.users.markEmailVerified(user.id);
    const revoked = await this.sessions.revokeAllForUser(user.id, 'password_reset');
    await this.mailer.send({
      to: user.email,
      locale: userLocale(user),
      template: 'passwordChanged',
      params: {},
    });
    await this.record('auth.password.reset', user.id, meta, { sessionsRevoked: revoked });
  }

  async recordSessionRevoked(principal: Principal, sessionId: string, meta: RequestMeta) {
    await this.record('auth.session.revoked', principal.userId, meta, { sessionId });
  }

  // --- helpers -----------------------------------------------------------------------

  private record(
    action: string,
    userId: string,
    meta: RequestMeta,
    changes?: Record<string, unknown>,
    overrides: { entityType?: string; entityId?: string; actorUserId?: string | null } = {},
  ): Promise<string> {
    return this.audit.record({
      action,
      entityType: overrides.entityType ?? 'user',
      entityId: overrides.entityId ?? userId,
      actorUserId: overrides.actorUserId === undefined ? userId : overrides.actorUserId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
      ...(changes ? { changes } : {}),
    });
  }
}
