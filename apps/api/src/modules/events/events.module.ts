import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { EventsAdminController } from './events-admin.controller';
import { EventsAdminService } from './events-admin.service';
import { EventsPublicController } from './events-public.controller';
import { EventsPublicService } from './events-public.service';

/** Events: management, public reads under the access tiers (M5). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [EventsAdminController, EventsPublicController],
  providers: [EventsAdminService, EventsPublicService],
  exports: [EventsAdminService, EventsPublicService],
})
export class EventsModule {}
