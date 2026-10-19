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
import { DemoOutboxController } from './demo-outbox.controller';
import { DemoOutboxService } from './demo-outbox.service';
import { SettingsService } from './settings.service';

/**
 * The admin portal's own screens (M8): the dashboard, accounts and roles, the audit log viewer
 * the site settings, and the demo's sent emails (M18).
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
    DemoOutboxController,
  ],
  providers: [
    AccountsService,
    AuditLogService,
    DashboardService,
    DemoOutboxService,
    SettingsService,
  ],
})
export class AdminModule {}
