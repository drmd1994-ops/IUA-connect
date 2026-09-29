import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { type Request, type Response } from 'express';
import { type RequestWithPrincipal } from '../../common/auth/principal';
import { Authenticated, Public } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { AuditService } from '../audit';
import { AccountSecurityService } from './account-security.service';
import {
  PasskeyDto,
  PasskeyListDto,
  PasskeyRegisterDto,
  PasskeyRenameDto,
  PasskeySignInDto,
  TokenDto,
  WebAuthnOptionsDto,
} from './auth.dto';
import { DEVICE_COOKIE, readCookie, setDeviceCookie, setSessionCookies } from './auth.cookies';
import { AuthService } from './auth.service';
import { principalOf } from './me.controller';
import { PasskeysService } from './passkeys.service';
import { SessionsService } from './sessions.service';

/** Passkeys (WebAuthn): add, manage, and sign in with them (docs/plans/M1b-passkeys.md §6). */
@ApiTags('passkeys')
@Controller('auth/passkeys')
export class PasskeysController {
  constructor(
    private readonly passkeys: PasskeysService,
    private readonly security: AccountSecurityService,
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  // --- adding a passkey (signed in) ------------------------------------------------

  /** Creation options for the browser. Needs a recent sign-in or re-authentication. */
  @Post('registration/options')
  @Authenticated()
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOkResponse({ type: WebAuthnOptionsDto })
  async registrationOptions(@Req() req: RequestWithPrincipal): Promise<WebAuthnOptionsDto> {
    const principal = principalOf(req);
    await this.security.assertRecentAuthentication(principal);
    return (await this.passkeys.registrationOptions(
      principal.userId,
    )) as unknown as WebAuthnOptionsDto;
  }

  /** Stores the new passkey. The device verified the person, so this session counts as MFA. */
  @Post('registration/verify')
  @Authenticated()
  @ApiBearerAuth()
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: PasskeyDto })
  async register(
    @Req() req: RequestWithPrincipal,
    @Body() body: PasskeyRegisterDto,
    @Meta() meta: RequestMeta,
  ): Promise<PasskeyDto> {
    const principal = principalOf(req);
    const passkey = await this.passkeys.register(
      principal.userId,
      body.response as unknown as RegistrationResponseJSON,
      body.name,
    );
    await this.sessions.markMfaCompleted(principal.sessionId);
    await this.record('auth.passkey.added', principal.userId, meta, { passkeyId: passkey.id });
    return passkey;
  }

  // --- managing passkeys (signed in) --------------------------------------------------

  @Get()
  @Authenticated()
  @ApiBearerAuth()
  @ApiOkResponse({ type: PasskeyListDto })
  async list(@Req() req: RequestWithPrincipal): Promise<PasskeyListDto> {
    return { passkeys: await this.passkeys.list(principalOf(req).userId) };
  }

  @Patch(':id')
  @Authenticated()
  @ApiBearerAuth()
  @ApiOkResponse({ type: PasskeyDto })
  rename(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PasskeyRenameDto,
  ): Promise<PasskeyDto> {
    return this.passkeys.rename(principalOf(req).userId, id, body.name);
  }

  /** Removes a passkey (needs re-authentication; a role requiring MFA must keep one factor). */
  @Delete(':id')
  @Authenticated()
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    await this.security.assertRecentAuthentication(principal);
    await this.passkeys.remove(principal.userId, id);
    await this.record('auth.passkey.removed', principal.userId, meta, { passkeyId: id });
  }

  // --- signing in with a passkey ---------------------------------------------------------

  /**
   * A challenge for signing in (or re-authenticating) with a passkey. The sign-in page requests
   * one on every load (for passkey autofill), so only the global per-IP limit applies here; the
   * verify step carries the strict sign-in limit.
   */
  @Post('authentication/options')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: WebAuthnOptionsDto })
  async authenticationOptions(): Promise<WebAuthnOptionsDto> {
    return (await this.passkeys.authenticationOptions()) as unknown as WebAuthnOptionsDto;
  }

  /** Signs in: same response and cookies as /auth/login (session with MFA). */
  @Post('authentication/verify')
  @Public()
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: TokenDto })
  async signIn(
    @Body() body: PasskeySignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Meta() meta: RequestMeta,
  ): Promise<TokenDto> {
    const check = await this.passkeys.verify(
      body.response as unknown as AuthenticationResponseJSON,
    );
    if (!check.ok) {
      await this.auth.auditPasskeyFailure(check.reason, null, meta);
      throw new AppException('PASSKEY_INVALID');
    }
    const { tokens, newDeviceCookie } = await this.auth.completePasskeySignIn(
      check.factor.userId,
      readCookie(req, DEVICE_COOKIE),
      meta,
    );
    if (newDeviceCookie) setDeviceCookie(res, newDeviceCookie);
    setSessionCookies(res, tokens.refreshToken, tokens.sessionExpiresAt);
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }

  private record(
    action: string,
    userId: string,
    meta: RequestMeta,
    changes: Record<string, unknown>,
  ) {
    return this.audit.record({
      action,
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      actorIp: meta.ip,
      correlationId: meta.correlationId,
      changes,
    });
  }
}
