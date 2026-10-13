import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { Authenticated } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { OrganisationQueryDto, OrganisationsService } from '../organisations';
import { ApplicationsService } from './applications.service';
import {
  ApplicationDto,
  ApplicationListDto,
  ApplyDto,
  DecisionDto,
  MyMembershipDto,
  MyMembershipsDto,
  ReviewApplicationDto,
  ReviewApplicationListDto,
  ReviewQueryDto,
} from './membership.dto';
import { MembershipsService } from './memberships.service';

/**
 * The signed-in person's memberships (API_DESIGN.md §4 "Me"). A membership is in an
 * organisation; `organisation` may be left out while it can only mean one (M16).
 */
@ApiTags('membership')
@ApiBearerAuth()
@Controller('me')
@Authenticated()
export class MyMembershipController {
  constructor(
    private readonly memberships: MembershipsService,
    private readonly organisations: OrganisationsService,
  ) {}

  @Get('membership')
  @ApiOkResponse({ type: MyMembershipDto })
  async mine(
    @Req() req: RequestWithPrincipal,
    @Query() query: OrganisationQueryDto,
  ): Promise<MyMembershipDto> {
    const { userId } = principalOf(req);
    const organisationId = await this.organisations.meantForMember(query.organisation, userId);
    if (!organisationId) return { membership: null, history: [] };
    return this.memberships.mine(userId, organisationId);
  }

  /** Every membership the person holds, one per organisation. */
  @Get('memberships')
  @ApiOkResponse({ type: MyMembershipsDto })
  async all(@Req() req: RequestWithPrincipal): Promise<MyMembershipsDto> {
    return { items: await this.memberships.all(principalOf(req).userId) };
  }
}

/**
 * Membership applications (API_DESIGN.md §4 "Verification"). Reviewing needs
 * membership.approve.department (own departments) or membership.approve.final; the service checks
 * which, because the stage is inferred from the application. Audited by the service.
 *
 * An application is to an organisation (M16): final approval is its office's, so
 * membership.approve.final is used where it is held, and an application to another organisation
 * reads as "not found".
 */
@ApiTags('membership')
@ApiBearerAuth()
@Controller('verification-requests')
@Authenticated()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @ApiCreatedResponse({ type: ApplicationDto })
  apply(
    @Req() req: RequestWithPrincipal,
    @Body() body: ApplyDto,
    @Meta() meta: RequestMeta,
  ): Promise<ApplicationDto> {
    return this.applications.apply(principalOf(req).userId, body, meta);
  }

  @Get('mine')
  @ApiOkResponse({ type: ApplicationListDto })
  async mine(@Req() req: RequestWithPrincipal): Promise<ApplicationListDto> {
    return { items: await this.applications.mine(principalOf(req).userId) };
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiOkResponse({ type: ApplicationDto })
  withdraw(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<ApplicationDto> {
    return this.applications.withdraw(principalOf(req).userId, id, meta);
  }

  @Get()
  @ApiOkResponse({ type: ReviewApplicationListDto })
  async queue(
    @Req() req: RequestWithPrincipal,
    @Query() query: ReviewQueryDto,
    @Meta() meta: RequestMeta,
  ): Promise<ReviewApplicationListDto> {
    return {
      items: await this.applications.queue(principalOf(req), query.stage, query.organisation, meta),
    };
  }

  @Post(':id/decisions')
  @HttpCode(200)
  @ApiOkResponse({ type: ReviewApplicationDto })
  decide(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DecisionDto,
    @Meta() meta: RequestMeta,
  ): Promise<ReviewApplicationDto> {
    return this.applications.decide(principalOf(req), id, body, meta);
  }
}
