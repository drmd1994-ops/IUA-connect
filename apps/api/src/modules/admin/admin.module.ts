import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AccountsController, RolesController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import {
  AdminDashboardController,
  AdminSettingsController,
  PublicSettingsController,
} from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SettingsService } from './settings.service';

/**
 * The admin portal's own screens (M8): the dashboard, accounts and roles, the audit log viewer
 * and the site settings.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminDashboardController,
    AccountsController,
    RolesController,
    AuditLogController,
    AdminSettingsController,
    PublicSettingsController,
  ],
  providers: [AccountsService, AuditLogService, DashboardService, SettingsService],
})
export class AdminModule {}
