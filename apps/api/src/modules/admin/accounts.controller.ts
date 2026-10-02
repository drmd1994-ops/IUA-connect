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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import { RequirePermission } from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import {
  AccountActionDto,
  AccountDto,
  AccountListDto,
  AccountListQueryDto,
  RoleChangeDto,
  RoleListDto,
} from './accounts.dto';
import { AccountsService } from './accounts.service';

/**
 * Accounts in the admin area. Reading needs users.read; changing an account's state needs
 * users.manage; giving and removing roles needs roles.manage (super admins). Admin roles apply
 * only in a session that completed MFA.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermission('users.read')
  @ApiOkResponse({ type: AccountListDto })
  list(@Query() query: AccountListQueryDto): Promise<AccountListDto> {
    return this.accounts.list(query);
  }

  @Get(':id')
  @RequirePermission('users.read')
  @ApiOkResponse({ type: AccountDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AccountDto> {
    return this.accounts.get(id);
  }

  @Post(':id/disable')
  @RequirePermission('users.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  disable(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AccountActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.disable(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/enable')
  @RequirePermission('users.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  enable(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AccountActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.enable(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/unlock')
  @RequirePermission('users.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  unlock(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AccountActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.unlock(id, body.reason, principalOf(req), meta);
  }

  /** Signs the person out everywhere. */
  @Post(':id/sessions/revoke')
  @RequirePermission('users.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  endSessions(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AccountActionDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.endSessions(id, body.reason, principalOf(req), meta);
  }

  @Post(':id/roles')
  @RequirePermission('roles.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  grantRole(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RoleChangeDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.grantRole(id, body.role, body.reason, principalOf(req), meta);
  }

  @Post(':id/roles/remove')
  @RequirePermission('roles.manage')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  removeRole(
    @Req() req: RequestWithPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RoleChangeDto,
    @Meta() meta: RequestMeta,
  ): Promise<AccountDto> {
    return this.accounts.removeRole(id, body.role, body.reason, principalOf(req), meta);
  }
}

/** The roles and what each may do (read-only: roles are fixed in code). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/roles')
@RequirePermission('users.read')
export class RolesController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOkResponse({ type: RoleListDto })
  list(): Promise<RoleListDto> {
    return this.accounts.roles();
  }
}
