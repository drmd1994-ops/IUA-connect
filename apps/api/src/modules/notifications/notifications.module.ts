import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { BroadcastsAdminController, BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { ContentAnnouncer } from './content-announcer';
import {
  NotificationPreferencesController,
  NotificationsController,
  UnsubscribeController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notifier } from './notifier';
import { UnsubscribeTokens } from './unsubscribe-tokens';

/** Notices in the app and by email, the switches each person sets, and broadcasts (M7). */
@Module({
  imports: [AuthModule],
  controllers: [
    NotificationsController,
    NotificationPreferencesController,
    UnsubscribeController,
    BroadcastsAdminController,
    BroadcastsController,
  ],
  providers: [
    NotificationsService,
    Notifier,
    ContentAnnouncer,
    UnsubscribeTokens,
    BroadcastsService,
  ],
  exports: [Notifier, ContentAnnouncer],
})
export class NotificationsModule {}
