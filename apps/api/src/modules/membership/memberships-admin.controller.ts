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
import { RequireScopedPermission } from '../../common/decorators/access.decorators';
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
 * Membership management for an organisation's staff (M2 plan §3.5; M16). Reading needs
 * membership.read, changes membership.manage, each held in the organisation whose membership it
 * is; both apply only in a session that completed MFA. The service checks the organisation and
 * audits.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/memberships')
export class MembershipsAdminController {
  constructor(private readonly admin: MembershipsAdminService) {}

  @Get()
  @RequireScopedPermission('membership.read')
  @ApiOkResponse({ type: AdminMembershipListDto })
  list(
    @Req() req: RequestWithPrincipal,
    @Query() query: MembershipListQueryDto,
  ): Promise<AdminMembershipListDto> {
    return this.admin.list(principalOf(req), query);
  }

  @Get(':id')
  @RequireScopedPermission('membership.read')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  detail(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.detail(principalOf(req), id, meta);
  }

  @Post()
  @RequireScopedPermission('membership.manage')
  @ApiCreatedResponse({ type: AdminMembershipDetailDto })
  create(
    @Req() req: RequestWithPrincipal,
    @Body() body: CreateMembershipDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.create(body, principalOf(req), meta);
  }

  @Post(':id/renew')
  @HttpCode(200)
  @RequireScopedPermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  renew(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.renew(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @RequireScopedPermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  suspend(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SuspendMembershipDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.suspend(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/reinstate')
  @HttpCode(200)
  @RequireScopedPermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  reinstate(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.reinstate(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/expire')
  @HttpCode(200)
  @RequireScopedPermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  expire(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MembershipActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.expire(id, body.reason, principalOf(req), meta);
  }

  @Patch(':id/payment-status')
  @RequireScopedPermission('membership.manage')
  @ApiOkResponse({ type: AdminMembershipDetailDto })
  paymentStatus(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PaymentStatusDto,
    @Meta() meta: RequestMeta,
  ): Promise<AdminMembershipDetailDto> {
    return this.admin.setPaymentStatus(id, body.paymentStatus, body.reason, principalOf(req), meta);
  }
}
