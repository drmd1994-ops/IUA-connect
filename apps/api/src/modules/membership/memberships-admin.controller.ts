import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AdminMembershipDetailDto,
  AdminMembershipListDto,
  CreateMembershipDto,
  MembershipActionDto,
  MembershipListQueryDto,
  PaymentStatusDto,
  SuspendMembershipDto,
} from './memberships-admin.dto';
import { MembershipsAdminService } from './memberships-admin.service';

/**
 * Membership management for IUA admins (M2 plan §3.5). Reading needs membership.read, changes
 * membership.manage; both apply only in a session that completed MFA. Audited by the service.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/memberships')
export class MembershipsAdminController {
  constructor(private readonly admin: MembershipsAdminService) {}

  @Get()
  @RequirePermission('membership.read')
  @ApiOkResponse({ type: AdminMembershipListDto })
  list(@Query() query: MembershipListQueryDto): Promise<AdminMembershipListDto> {
    return this.admin.list(query);
  }

  @Get(':id')
  @RequirePermission('membership.read')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminMembershipDetailDto> {
    return this.admin.detail(id);
  }

  @Post()
  @RequirePermission('membership.manage')
  @ApiCreatedResponse({ type: AdminMembershipDetailDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: CreateMembershipDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.create(body, principalOf(req).userId, meta);
  }

  @Post(':id/renew')
  @HttpCode(200)
  @RequirePermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  renew(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.renew(id, body.reason, principalOf(req).userId, meta);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequirePermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  suspend(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SuspendMembershipDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.suspend(id, body.reason, principalOf(req).userId, meta);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  @RequirePermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  reinstate(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.reinstate(id, body.reason, principalOf(req).userId, meta);
  }

  @Post(':id/expire')
  @HttpCode(200)
  @RequirePermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  expire(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.expire(id, body.reason, principalOf(req).userId, meta);
  }

  @Patch(':id/payment-status')
  @RequirePermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  paymentStatus(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PaymentStatusDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.setPaymentStatus(
      id,
      body.paymentStatus,
      body.reason,
      principalOf(req).userId,
      meta,
    );
  }
}
