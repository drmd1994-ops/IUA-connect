import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AccountsController, RolesController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/** The admin portal's own screens: accounts and roles, and the audit log viewer (M8). */
@Module({
  imports: [AuthModule],
  controllers: [AccountsController, RolesController, AuditLogController],
  providers: [AccountsService, AuditLogService],
})
export class AdminModule {}
