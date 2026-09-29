import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { AccountSecurityService } from './account-security.service';
import {
  MfaStatusDto,
  OkDto,
  PasswordChangeDto,
  ReauthenticateDto,
  RecoveryCodesDto,
  RevokedCountDto,
  SessionListDto,
  TotpConfirmDto,
  TotpSetupDto,
} from './auth.dto';
import { describeUserAgent } from './devices.service';
import { SessionsService } from './sessions.service';

/** The signed-in user's own security settings: MFA, password, sessions (API_DESIGN.md §4). */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@Authenticated()
export class AccountSecurityController {
  constructor(
    private readonly security: AccountSecurityService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Confirm identity before sensitive changes: the password (and a code when an authenticator app
   * is on), or a passkey (challenge from POST /auth/passkeys/authentication/options).
   */
  @Post('reauthenticate')
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: OkDto })
  async reauthenticate(
    @Req() req: RequestWithPrincipal,
    @Body() body: ReauthenticateDto,
    @Meta() meta: RequestMeta,
  ): Promise<OkDto> {
    const input = body.passkey
      ? { passkey: body.passkey as unknown as AuthenticationResponseJSON }
      : { password: body.password!, ...(body.code ? { code: body.code } : {}) };
    await this.security.reauthenticate(principalOf(req), input, meta);
    return { status: 'ok' };
  }

  // --- MFA ---------------------------------------------------------------------

  @Get('mfa')
  @ApiOkResponse({ type: MfaStatusDto })
  mfaStatus(@Req() req: RequestWithPrincipal): Promise<MfaStatusDto> {
    return this.security.mfaStatus(principalOf(req));
  }

  /** Starts authenticator-app enrolment (needs a recent sign-in or re-authentication). */
  @Post('mfa/totp/setup')
  @HttpCode(200)
  @ApiOkResponse({ type: TotpSetupDto })
  setupTotp(@Req() req: RequestWithPrincipal): Promise<TotpSetupDto> {
    return this.security.startTotp(principalOf(req));
  }

  /** Confirms enrolment with a first code; returns the recovery codes (shown only once). */
  @Post('mfa/totp/confirm')
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async confirmTotp(
    @Req() req: RequestWithPrincipal,
    @Body() body: TotpConfirmDto,
    @Meta() meta: RequestMeta,
  ): Promise<RecoveryCodesDto> {
    const recoveryCodes = await this.security.confirmTotp(
      principalOf(req),
      body.factorId,
      body.code,
      meta,
    );
    return { recoveryCodes };
  }

  /** Turns MFA off (needs re-authentication; refused while a role requires MFA). */
  @Delete('mfa/:factorId')
  @HttpCode(204)
  @ApiNoContentResponse()
  async disableMfa(
    @Req() req: RequestWithPrincipal,
    @Param('factorId', new ParseUUIDPipe()) factorId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.security.disableMfa(principalOf(req), factorId, meta);
  }

  /** Replaces all recovery codes (needs re-authentication). */
  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @ApiOkResponse({ type: RecoveryCodesDto })
  async regenerateRecoveryCodes(
    @Req() req: RequestWithPrincipal,
    @Meta() meta: RequestMeta,
  ): Promise<RecoveryCodesDto> {
    return { recoveryCodes: await this.security.regenerateRecoveryCodes(principalOf(req), meta) };
  }

  // --- password ------------------------------------------------------------------

  /** Needs the current password; signs out every other session. */
  @Post('password/change')
  @RateLimit(RATE_LIMITS.signInPerIp)
  @HttpCode(200)
  @ApiOkResponse({ type: OkDto })
  async changePassword(
    @Req() req: RequestWithPrincipal,
    @Body() body: PasswordChangeDto,
    @Meta() meta: RequestMeta,
  ): Promise<OkDto> {
    await this.security.changePassword(principalOf(req), body, meta);
    return { status: 'ok' };
  }

  // --- sessions ------------------------------------------------------------------

  @Get('sessions')
  @ApiOkResponse({ type: SessionListDto })
  async listSessions(@Req() req: RequestWithPrincipal): Promise<SessionListDto> {
    const principal = principalOf(req);
    const sessions = await this.sessions.listActive(principal.userId);
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        device: describeUserAgent(session.userAgent),
        ip: session.ip,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === principal.sessionId,
      })),
    };
  }

  /** Signs out one of the user's own sessions (404 for anyone else's). */
  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async revokeSession(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const principal = principalOf(req);
    const session = await this.sessions.findById(id);
    if (!session || session.userId !== principal.userId || session.revokedAt) {
      throw new AppException('NOT_FOUND');
    }
    await this.sessions.revoke(session, 'user_revoked');
    await this.security.recordSessionRevoked(principal, id, meta);
  }

  /** Signs out every session except this one. */
  @Delete('sessions')
  @HttpCode(200)
  @ApiOkResponse({ type: RevokedCountDto })
  async revokeOtherSessions(
    @Req() req: RequestWithPrincipal,
    @Meta() meta: RequestMeta,
  ): Promise<RevokedCountDto> {
    const principal = principalOf(req);
    const revoked = await this.sessions.revokeAllForUser(
      principal.userId,
      'user_revoked',
      principal.sessionId,
    );
    await this.security.recordSessionRevoked(principal, 'all-others', meta);
    return { revoked };
  }
}
