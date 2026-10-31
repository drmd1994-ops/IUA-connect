import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import { ConferenceJobs } from './conference.job';
import { ConferenceStream } from './conference-stream';
import {
  ConferenceAdminController,
  ConferenceChairController,
  ConferenceController,
  GuestEntryController,
} from './conference.controller';
import { ConferenceService } from './conference.service';
import { EventsAdminController } from './events-admin.controller';
import { EventsAdminService } from './events-admin.service';
import { EventsPublicController } from './events-public.controller';
import { AttendanceAdminController, EventCheckInController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { CalendarService } from './calendar.service';
import { CheckInTokens } from './check-in-token';
import { EventMailer } from './event-mailer';
import { EventOwnerGuard } from './event-owner.guard';
import { EventsPublicService } from './events-public.service';
import {
  EventRegistrationController,
  MyScheduleController,
  RegistrationsAdminController,
} from './registrations.controller';
import { RegistrationsService } from './registrations.service';
import { EventRemindersJob } from './reminders.job';
import { SessionsAdminController, SpeakersAdminController } from './sessions-admin.controller';
import { SessionsService } from './sessions.service';

/** Events, sessions and speakers: management, and public reads under the access tiers (M5). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule, NotificationsModule],
  controllers: [
    EventsAdminController,
    SessionsAdminController,
    SpeakersAdminController,
    RegistrationsAdminController,
    AttendanceAdminController,
    EventCheckInController,
    MyScheduleController,
    EventRegistrationController,
    ConferenceAdminController,
    ConferenceChairController,
    ConferenceController,
    GuestEntryController,
    EventsPublicController,
  ],
  providers: [
    EventsAdminService,
    EventsPublicService,
    SessionsService,
    RegistrationsService,
    CalendarService,
    AttendanceService,
    CheckInTokens,
    EventMailer,
    EventOwnerGuard,
    EventRemindersJob,
    ConferenceService,
    ConferenceStream,
    ConferenceJobs,
  ],
  exports: [EventsAdminService, EventsPublicService],
})
export class EventsModule {}
