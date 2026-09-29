import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type Principal,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UsersService } from '../users';
import { MeDto, UpdateMeDto } from './auth.dto';
import { userLocale } from './auth.service';

/** The signed-in user's own account (API_DESIGN.md §4 "Me"). */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Authenticated()
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  async me(@Req() req: RequestWithPrincipal): Promise<MeDto> {
    return this.describe(principalOf(req));
  }

  @Patch()
  @ApiOkResponse({ type: MeDto })
  async update(@Req() req: RequestWithPrincipal, @Body() body: UpdateMeDto): Promise<MeDto> {
    const principal = principalOf(req);
    await this.users.setLocale(principal.userId, body.locale);
    return this.describe(principal);
  }

  private async describe(principal: Principal): Promise<MeDto> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new AppException('UNAUTHENTICATED');
    const mfaFactors = await this.prisma.mfaFactor.count({
      where: { userId: user.id, confirmedAt: { not: null } },
    });
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      locale: userLocale(user),
      roles: [...principal.roles],
      permissions: [...principal.permissions].sort(),
      mfaEnabled: mfaFactors > 0,
      mfaEnrollmentRequired: principal.mfaEnrollmentRequired,
      session: { id: principal.sessionId, mfa: principal.mfa },
    };
  }
}
