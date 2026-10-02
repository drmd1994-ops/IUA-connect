import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { NotificationsModule } from '../notifications';
import { GuidelinesAdminController } from './guidelines-admin.controller';
import { GuidelinesPublicController } from './guidelines-public.controller';
import { GuidelinesService } from './guidelines.service';

/** Guidelines: metadata, official links, versions and IUA summaries under access tiers (M3). */
@Module({
  imports: [AccessModule, AuthModule, NotificationsModule],
  controllers: [GuidelinesAdminController, GuidelinesPublicController],
  providers: [GuidelinesService],
  exports: [GuidelinesService],
})
export class GuidelinesModule {}
