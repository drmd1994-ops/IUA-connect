import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type RequestWithPrincipal, principalOf } from '../../common/auth/principal';
import {
  Public,
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/access.decorators';
import { type RequestMeta, Meta } from '../../common/request-meta';
import { AdminDashboardDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import { PublicSettingsDto, SettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

/**
 * The admin dashboard. Open to anyone who holds a permission of one of the admin screens; the
 * answer holds only the parts that person may act on.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequireAnyPermission(
    'membership.read',
    'membership.approve.final',
    'institutions.manage',
    'news.create',
    'news.review',
    'guidelines.manage',
    'events.manage',
    'education.manage',
    'education.review',
    'broadcasts.create',
    'broadcasts.approve',
    'chat.moderate',
    'users.read',
    'audit.read',
    'settings.manage',
  )
  @ApiOkResponse({ type: AdminDashboardDto })
  get(@Req() req: RequestWithPrincipal): Promise<AdminDashboardDto> {
    return this.dashboard.get(principalOf(req));
  }
}

/** The site settings, for super admins. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/settings')
@RequirePermission('settings.manage')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }

  @Put()
  @ApiOkResponse({ type: SettingsDto })
  set(
    @Req() req: RequestWithPrincipal,
    @Body() body: SettingsDto,
    @Meta() meta: RequestMeta,
  ): Promise<SettingsDto> {
    return this.settings.set(body, principalOf(req), meta);
  }
}

/** What every page shows: the contact details and the notice, when one is switched on. */
@ApiTags('settings')
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @Public()
  @ApiOkResponse({ type: PublicSettingsDto })
  get(): Promise<PublicSettingsDto> {
    return this.settings.public();
  }
}
