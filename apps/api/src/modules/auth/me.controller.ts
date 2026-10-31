import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type Principal,
  type RequestWithPrincipal,
  principalOf,
} from '../../common/auth/principal';
import { Authenticated, GuestAllowed } from '../../common/decorators/access.decorators';
import { RATE_LIMITS, RateLimit } from '../../common/decorators/rate-limit.decorator';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ORGANISATION_REF } from '../organisations';
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
  @GuestAllowed()
  @RateLimit(RATE_LIMITS.conferenceHall)
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

  /** A conference guest: the event they came for, and the number they are shown by (M32). */
  private async guestOf(userId: string) {
    const guest = await this.prisma.eventGuest.findUnique({
      where: { userId },
      select: { number: true, event: { select: { slug: true } } },
    });
    return guest ? { number: guest.number, eventSlug: guest.event.slug } : null;
  }

  private async describe(principal: Principal): Promise<MeDto> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new AppException('UNAUTHENTICATED');
    const mfaFactors = await this.prisma.mfaFactor.count({
      where: { userId: user.id, confirmedAt: { not: null } },
    });
    const profile = await this.users.accessProfile(user.id);
    const staffOf = await this.prisma.organisation.findMany({
      where: { id: { in: [...principal.organisationPermissions.keys()] } },
      select: ORGANISATION_REF,
      orderBy: [{ nameEn: 'asc' }, { id: 'asc' }],
    });
    const organisations = staffOf.map((organisation) => ({
      organisation,
      roles: [
        ...new Set(
          profile.roles
            .filter((role) => role.organisationId === organisation.id)
            .map((role) => role.key),
        ),
      ].sort(),
      permissions: [...(principal.organisationPermissions.get(organisation.id) ?? [])].sort(),
    }));
    const platformPermissions = [...principal.permissions].sort();
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      locale: userLocale(user),
      roles: [...new Set(profile.roles.map((role) => role.key))].sort(),
      permissions: [
        ...new Set([...platformPermissions, ...organisations.flatMap((held) => held.permissions)]),
      ].sort(),
      platformPermissions,
      organisations,
      verified: principal.verified,
      verifiedAs: principal.verified ? user.verifiedAs : null,
      mfaEnabled: mfaFactors > 0,
      mfaEnrollmentRequired: principal.mfaEnrollmentRequired,
      session: { id: principal.sessionId, mfa: principal.mfa },
      guest: principal.guestEventId ? await this.guestOf(user.id) : null,
    };
  }
}
