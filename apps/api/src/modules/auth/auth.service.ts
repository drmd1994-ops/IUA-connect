import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@iua/i18n';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta } from '../../common/request-meta';
import { PasswordHasher } from '../../infra/crypto/password-hasher';
import { Mailer } from '../../infra/mailer/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { type User } from '../../generated/prisma/client';
import { AuditService } from '../audit';
import { UsersService } from '../users';
import { AuthTokensService } from './auth-tokens.service';
import { DevicesService, describeUserAgent } from './devices.service';
import { checkPassword } from './password/password-policy';
import { type IssuedTokens, SessionsService } from './sessions.service';

export type LoginOutcome =
  | { mfaRequired: false; tokens: IssuedTokens; newDeviceCookie: string | null }
  | {
      mfaRequired: true;
      mfaToken: string;
      mfaMethods: ('totp' | 'passkey')[];
      newDeviceCookie: string | null;
    };

/**
 * Account sign-up and sign-in (SECURITY_MODEL.md §3). Responses never reveal whether an email is
 * registered: register and resend always "accept", and every sign-in failure looks the same.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordHasher,
    private readonly tokens: AuthTokensService,
    private readonly sessions: SessionsService,
    private readonly devices: DevicesService,
    private readonly mailer: Mailer,
    private readonly audit: AuditService,
  ) {}

  // --- registration ----------------------------------------------------------

  async register(
    input: { email: string; password: string; locale?: Locale },
    meta: RequestMeta,
  ): Promise<void> {
    assertPasswordPolicy(input.password, input.email);
    // Hash first, whatever happens next, so existing and new addresses take the same time.
    const passwordHash = await this.passwords.hash(input.password);
    const locale = input.locale ?? DEFAULT_LOCALE;

    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      if (existing.emailVerifiedAt) {
        await this.mailer.send({
          to: existing.email,
          locale: userLocale(existing),
          template: 'accountExists',
          params: { signInLink: this.link(userLocale(existing), 'login') },
        });
      } else {
        await this.sendVerification(existing);
      }
      await this.audit.record({
        action: 'auth.register.existing_email',
        entityType: 'user',
        entityId: existing.id,
        actorIp: meta.ip,
        correlationId: meta.correlationId,
      });
      return;
    }

    const user = await this.users.create({ email: input.email, passwordHash, locale });
    await this.sendVerification(user);
    await this.audit.record({
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      actorUserId: user.id,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
    });
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const row = await this.tokens.consume(token, 'EMAIL_VERIFICATION');
    if (!row) throw new AppException('INVALID_TOKEN');
    await this.users.markEmailVerified(row.userId);
    await this.audit.record({
      action: 'auth.email_verified',
      entityType: 'user',
      entityId: row.userId,
      actorUserId: row.userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
    });
  }

  /** Always "accepted"; only unverified accounts actually get a new email. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (user && !user.emailVerifiedAt && user.status === 'ACTIVE') {
      await this.sendVerification(user);
    }
  }

  // --- sign-in ---------------------------------------------------------------

  async login(
    input: { email: string; password: string },
    deviceCookie: string | undefined,
    meta: RequestMeta,
  ): Promise<LoginOutcome> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.passwords.verifyDummy(input.password);
      await this.auditLoginFailure(null, 'unknown_email', meta);
      throw new AppException('INVALID_CREDENTIALS');
    }

    if (this.users.isLocked(user)) {
      // Same answer and the same work as a wrong password: a lock must not confirm the account.
      await this.passwords.verify(user.passwordHash, input.password);
      await this.auditLoginFailure(user.id, 'locked', meta);
      throw new AppException('INVALID_CREDENTIALS');
    }

    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      const result = await this.users.recordFailedLogin(user);
      await this.auditLoginFailure(user.id, 'wrong_password', meta);
      if (result.locked) {
        await this.audit.record({
          action: 'auth.lockout',
          entityType: 'user',
          entityId: user.id,
          actorIp: meta.ip,
          correlationId: meta.correlationId,
          changes: { minutes: result.minutes },
        });
        await this.mailer.send({
          to: user.email,
          locale: userLocale(user),
          template: 'accountLocked',
          params: { minutes: result.minutes },
        });
      }
      throw new AppException('INVALID_CREDENTIALS');
    }

    // The password is right. From here on, answers may be specific.
    if (user.status === 'DISABLED') throw new AppException('ACCOUNT_DISABLED');
    if (!user.emailVerifiedAt) throw new AppException('EMAIL_NOT_VERIFIED');

    await this.users.recordSuccessfulLogin(
      user.id,
      this.passwords.needsRehash(user.passwordHash)
        ? await this.passwords.hash(input.password)
        : undefined,
    );
    const device = await this.recognizeDevice(user, deviceCookie, meta);

    const factors = await this.prisma.mfaFactor.findMany({
      where: { userId: user.id, confirmedAt: { not: null } },
      select: { type: true },
    });
    if (factors.length > 0) {
      const mfaMethods = [
        ...(factors.some((f) => f.type === 'TOTP') ? (['totp'] as const) : []),
        ...(factors.some((f) => f.type === 'WEBAUTHN') ? (['passkey'] as const) : []),
      ];
      const mfaToken = await this.tokens.issue(user.id, 'MFA_CHALLENGE');
      await this.audit.record({
        action: 'auth.login.password_ok_mfa_pending',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        actorIp: meta.ip,
        correlationId: meta.correlationId,
      });
      return { mfaRequired: true, mfaToken, mfaMethods, newDeviceCookie: device.newCookieToken };
    }

    const tokens = await this.startSession(user.id, device.deviceId, false, meta, 'password');
    return { mfaRequired: false, tokens, newDeviceCookie: device.newCookieToken };
  }

  /**
   * Signs in with a verified passkey (docs/plans/M1b-passkeys.md). The passkey required user
   * verification on the device, so the session counts as MFA-verified. A temporary password
   * lockout doesn't block it: the lockout protects the password, which isn't used here.
   */
  async completePasskeySignIn(
    userId: string,
    deviceCookie: string | undefined,
    meta: RequestMeta,
  ): Promise<{ tokens: IssuedTokens; newDeviceCookie: string | null }> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') throw new AppException('ACCOUNT_DISABLED');
    if (!user.emailVerifiedAt) throw new AppException('EMAIL_NOT_VERIFIED');
    await this.users.recordSuccessfulLogin(user.id);
    const device = await this.recognizeDevice(user, deviceCookie, meta);
    const tokens = await this.startSession(user.id, device.deviceId, true, meta, 'passkey');
    return { tokens, newDeviceCookie: device.newCookieToken };
  }

  async auditPasskeyFailure(reason: string, userId: string | null, meta: RequestMeta) {
    await this.audit.record({
      action:
        reason === 'counter_regression' ? 'auth.passkey.counter_regression' : 'auth.login.failure',
      entityType: userId ? 'user' : null,
      entityId: userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
      changes: { method: 'passkey', reason },
    });
  }

  /** Recognizes the browser; emails the user about a sign-in from a new device. */
  private async recognizeDevice(user: User, deviceCookie: string | undefined, meta: RequestMeta) {
    const device = await this.devices.identify(user.id, deviceCookie, meta.userAgent);
    if (device.isNewForUser) {
      await this.mailer.send({
        to: user.email,
        locale: userLocale(user),
        template: 'newDevice',
        params: {
          device: describeUserAgent(meta.userAgent),
          time: new Date().toLocaleString(userLocale(user) === 'he' ? 'he-IL' : 'en-GB', {
            timeZone: 'Asia/Jerusalem',
          }),
        },
      });
    }
    return device;
  }

  private async startSession(
    userId: string,
    deviceId: string,
    mfa: boolean,
    meta: RequestMeta,
    method: 'password' | 'passkey',
  ): Promise<IssuedTokens> {
    const tokens = await this.sessions.create({ userId, deviceId, mfa, meta });
    await this.audit.record({
      action: 'auth.login.success',
      entityType: 'session',
      entityId: tokens.sessionId,
      actorUserId: userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
      ...(method === 'passkey' ? { changes: { method } } : {}),
    });
    return tokens;
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!refreshToken) return;
    const session = await this.sessions.sessionForRefreshToken(refreshToken);
    if (!session) return;
    await this.sessions.revoke(session, 'logout');
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'session',
      entityId: session.id,
      actorUserId: session.userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
    });
  }

  // --- helpers ---------------------------------------------------------------

  private async sendVerification(user: User): Promise<void> {
    const token = await this.tokens.issue(user.id, 'EMAIL_VERIFICATION');
    const locale = userLocale(user);
    await this.mailer.send({
      to: user.email,
      locale,
      template: 'verifyEmail',
      params: { link: this.link(locale, 'verify-email', token) },
    });
  }

  /** Link into the web app, e.g. http://localhost:3001/he/verify-email?token=... */
  link(locale: Locale, page: string, token?: string): string {
    const url = new URL(`/${locale}/${page}`, this.env.APP_BASE_URL);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  private async auditLoginFailure(
    userId: string | null,
    reason: 'unknown_email' | 'locked' | 'wrong_password',
    meta: RequestMeta,
  ): Promise<void> {
    await this.audit.record({
      action: 'auth.login.failure',
      entityType: userId ? 'user' : null,
      entityId: userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
      changes: { reason },
    });
  }
}

export function userLocale(user: Pick<User, 'locale'>): Locale {
  return isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
}

/** Throws VALIDATION_FAILED with one detail per policy problem (translated by the client). */
export function assertPasswordPolicy(password: string, email?: string): void {
  const problems = checkPassword(password, email);
  if (problems.length) {
    throw new AppException(
      'VALIDATION_FAILED',
      problems.map((code) => ({ field: 'password', code })),
    );
  }
}
