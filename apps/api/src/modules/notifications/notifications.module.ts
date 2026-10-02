import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import {
  NotificationPreferencesController,
  NotificationsController,
  UnsubscribeController,
} from './notifications.controller';
import { ContentAnnouncer } from './content-announcer';
import { NotificationsService } from './notifications.service';
import { Notifier } from './notifier';
import { UnsubscribeTokens } from './unsubscribe-tokens';

/** Notices in the app and by email, and the switches each person sets (M7). */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, NotificationPreferencesController, UnsubscribeController],
  providers: [NotificationsService, Notifier, ContentAnnouncer, UnsubscribeTokens],
  exports: [Notifier, ContentAnnouncer],
})
export class NotificationsModule {}
