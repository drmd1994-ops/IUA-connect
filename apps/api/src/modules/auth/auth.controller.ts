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
  LoginDto,
  LoginResultDto,
  OkDto,
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
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

/** Sign-up, sign-in and token renewal (API_DESIGN.md §3–4). */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
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
    const outcome = await this.auth.login(body, readCookie(req, DEVICE_COOKIE), meta);
    if (outcome.newDeviceCookie) setDeviceCookie(res, outcome.newDeviceCookie);
    if (outcome.mfaRequired) return { mfaRequired: true, mfaToken: outcome.mfaToken };
    setSessionCookies(res, outcome.tokens.refreshToken, outcome.tokens.sessionExpiresAt);
    return {
      mfaRequired: false,
      accessToken: outcome.tokens.accessToken,
      expiresIn: outcome.tokens.expiresIn,
    };
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
