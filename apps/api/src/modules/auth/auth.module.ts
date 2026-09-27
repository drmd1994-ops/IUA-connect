import { Module } from '@nestjs/common';
import { PrincipalResolver } from '../../common/auth/principal';
import { UsersModule } from '../users';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth-tokens.service';
import { DevicesService } from './devices.service';
import { MeController } from './me.controller';
import { SessionsService } from './sessions.service';

/**
 * Identity (ADR 0002: in-house, behind interfaces). Exports the PrincipalResolver the global
 * permission guard uses to recognise callers.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController, MeController],
  providers: [
    AccessTokenService,
    AuthService,
    AuthTokensService,
    DevicesService,
    SessionsService,
    { provide: PrincipalResolver, useExisting: SessionsService },
  ],
  exports: [PrincipalResolver, SessionsService],
})
export class AuthModule {}
