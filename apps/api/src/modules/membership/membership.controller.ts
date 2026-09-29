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
import { ApplicationsService } from './applications.service';
import {
  ApplicationDto,
  ApplicationListDto,
  ApplyDto,
  DecisionDto,
  MyMembershipDto,
  ReviewApplicationDto,
  ReviewApplicationListDto,
  ReviewQueryDto,
} from './membership.dto';
import { MembershipsService } from './memberships.service';

/** The signed-in member's membership (API_DESIGN.md §4 "Me"). */
@ApiTags('membership')
@ApiBearerAuth()
@Controller('me/membership')
@Authenticated()
export class MyMembershipController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @ApiOkResponse({ type: MyMembershipDto })
  mine(@Req() req: RequestWithPrincipal): Promise<MyMembershipDto> {
    return this.memberships.mine(principalOf(req).userId);
  }
}

/**
 * Membership applications (API_DESIGN.md §4 "Verification"). Reviewing needs
 * membership.approve.department (own departments) or membership.approve.final; the service checks
 * which, because the stage is inferred from the application. Audited by the service.
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
  ): Promise<ReviewApplicationListDto> {
    return { items: await this.applications.queue(principalOf(req), query.stage) };
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
