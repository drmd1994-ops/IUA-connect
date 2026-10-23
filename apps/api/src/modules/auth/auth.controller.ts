import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { Public } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { AppException } from '../../common/errors/app.exception';
import {
  AcceptedDto,
  AppRefreshDto,
  LoginDto,
  LoginResultDto,
  MfaVerifyDto,
  OkDto,
  PasswordForgotDto,
  PasswordResetDto,
  RegisterDto,
  ResendVerificationDto,
  TokenDto,
  VerifyEmailDto,
} from './auth.dto';
import {
  DEVICE_COOKIE,
  REFRESH_COOKIE,
  assertCsrf,
  clearSessionCookies,
  readCookie,
  setDeviceCookie,
  setSessionCookies,
} from './auth.cookies';
import { AccountSecurityService } from './account-security.service';
import { AuthService } from './auth.service';
import { type IssuedTokens, type SessionClientInfo, SessionsService } from './sessions.service';

/** Sign-up, sign-in and token renewal (API_DESIGN.md §3–4). */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly security: AccountSecurityService,
  ) {}

  /** Always 202, whether or not the address is already registered. */
  @Post('register')
  @Public()
  @RateLimit(RATE_LIMITS.accountCreationPerIp)
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedDto })
  async register(@Body() body: RegisterDto, @Meta() meta: RequestMeta): Promise<AcceptedDto> {
    await this.auth.register(body, meta);
    return { status: 'accepted' };
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: OkDto })
  async verifyEmail(@Body() body: VerifyEmailDto, @Meta() meta: RequestMeta): Promise<OkDto> {
    await this.auth.verifyEmail(body.token, meta);
    return { status: 'ok' };
  }

  /** Always 202. */
  @Post('verify-email/resend')
  @Public()
  @RateLimit(RATE_LIMITS.accountCreationPerIp)
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedDto })
  async resendVerification(@Body() body: ResendVerificationDto): Promise<AcceptedDto> {
    await this.auth.resendVerification(body.email);
    return { status: 'accepted' };
  }

  @Post('login')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerAccount, RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResultDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<LoginResultDto> {
    if (body.client === 'app') {
      // The mobile app: no cookies at all. What a browser keeps in cookies is in the answer.
      const outcome = await this.auth.login(body, body.deviceToken, meta, appInfo(body));
      const deviceToken = outcome.newDeviceCookie ? { deviceToken: outcome.newDeviceCookie } : {};
      if (outcome.mfaRequired) {
        return {
          mfaRequired: true,
          mfaToken: outcome.mfaToken,
          mfaMethods: outcome.mfaMethods,
          ...deviceToken,
        };
      }
      return { mfaRequired: false, ...appTokens(outcome.tokens), ...deviceToken };
    }
    const outcome = await this.auth.login(body, readCookie(req, DEVICE_COOKIE), meta);
    if (outcome.newDeviceCookie) setDeviceCookie(res, outcome.newDeviceCookie);
    if (outcome.mfaRequired) {
      return { mfaRequired: true, mfaToken: outcome.mfaToken, mfaMethods: outcome.mfaMethods };
    }
    setSessionCookies(res, outcome.tokens.refreshToken, outcome.tokens.sessionExpiresAt);
    return {
      mfaRequired: false,
      accessToken: outcome.tokens.accessToken,
      expiresIn: outcome.tokens.expiresIn,
    };
  }

  /** Second sign-in step: the challenge from /auth/login plus an authenticator or recovery code. */
  @Post('mfa/verify')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerAccount, RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: TokenDto })
  async verifyMfa(
    @Body() body: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<TokenDto> {
    if (body.client === 'app') {
      return appTokens(
        await this.security.completeMfaLogin(
          body.mfaToken,
          body.code,
          body.deviceToken,
          meta,
          appInfo(body),
        ),
      );
    }
    const tokens = await this.security.completeMfaLogin(
      body.mfaToken,
      body.code,
      readCookie(req, DEVICE_COOKIE),
      meta,
    );
    setSessionCookies(res, tokens.refreshToken, tokens.sessionExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  /**
   * The mobile app's refresh (M14): the refresh token is in the body and a new one is in the
   * answer. No cookie is read or set, so there is no CSRF header: that check protects cookies.
   * Only a session the app started is accepted here, and such a session nowhere else.
   */
  @Post('app/refresh')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: TokenDto })
  async appRefresh(@Body() body: AppRefreshDto, @Meta() meta: RequestMeta): Promise<TokenDto> {
    return appTokens(await this.sessions.refresh(body.refreshToken, meta, 'APP'));
  }

  /** The mobile app's sign-out: ends the session of this refresh token. Always 204. */
  @Post('app/logout')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(204)
  @ApiNoContentResponse()
  async appLogout(@Body() body: AppRefreshDto, @Meta() meta: RequestMeta): Promise<void> {
    await this.auth.logout(body.refreshToken, meta, 'APP');
  }

  /** Always 202, whether or not the address is registered. */
  @Post('password/forgot')
  @Public()
  @RateLimit(RATE_LIMITS.accountCreationPerIp)
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedDto })
  async forgotPassword(
    @Body() body: PasswordForgotDto,
    @Meta() meta: RequestMeta,
  ): Promise<AcceptedDto> {
    await this.security.forgotPassword(body.email, meta);
    return { status: 'accepted' };
  }

  /** Sets a new password from the emailed link; signs out every session. */
  @Post('password/reset')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: OkDto })
  async resetPassword(@Body() body: PasswordResetDto, @Meta() meta: RequestMeta): Promise<OkDto> {
    await this.security.resetPassword(body.token, body.newPassword, meta);
    return { status: 'ok' };
  }

  /** Rotates the refresh cookie and returns a new access token. Needs the CSRF header. */
  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOkResponse({ type: TokenDto })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<TokenDto> {
    assertCsrf(req);
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (!refreshToken) throw new AppException('UNAUTHENTICATED');
    try {
      const tokens = await this.sessions.refresh(refreshToken, meta);
      setSessionCookies(res, tokens.refreshToken, tokens.sessionExpiresAt);
      return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
    } catch (error) {
      clearSessionCookies(res);
      throw error;
    }
  }

  /** Ends the current session. Needs the CSRF header; always 204. */
  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    assertCsrf(req);
    await this.auth.logout(readCookie(req, REFRESH_COOKIE), meta);
    clearSessionCookies(res);
  }
}

/** What a sign-in from the mobile app says about itself. */
export function appInfo(body: { deviceName?: string | undefined }): SessionClientInfo {
  return { client: 'APP', clientName: body.deviceName ?? null };
}

/** The tokens as the mobile app receives them: all in the answer, nothing in a cookie. */
export function appTokens(tokens: IssuedTokens) {
  return {
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    refreshToken: tokens.refreshToken,
    sessionExpiresAt: tokens.sessionExpiresAt.toISOString(),
  };
}
