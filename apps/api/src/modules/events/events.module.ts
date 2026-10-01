import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { EventsAdminController } from './events-admin.controller';
import { EventsAdminService } from './events-admin.service';
import { EventsPublicController } from './events-public.controller';
import { EventsPublicService } from './events-public.service';
import { SessionsAdminController, SpeakersAdminController } from './sessions-admin.controller';
import { SessionsService } from './sessions.service';

/** Events, sessions and speakers: management, and public reads under the access tiers (M5). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [
    EventsAdminController,
    SessionsAdminController,
    SpeakersAdminController,
    EventsPublicController,
  ],
  providers: [EventsAdminService, EventsPublicService, SessionsService],
  exports: [EventsAdminService, EventsPublicService],
})
export class EventsModule {}
