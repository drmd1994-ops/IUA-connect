import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { Notifier } from './notifier';

/** Notices in the app and by email, and the switches each person sets (M7). */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService, Notifier],
  exports: [Notifier],
})
export class NotificationsModule {}
