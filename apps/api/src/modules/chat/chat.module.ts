import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { NotificationsModule } from '../notifications';
import { ProfilesModule } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatNotifier } from './chat-notifier';
import { ChatAdminController, ChatReportsController } from './chat-reports.controller';
import { ChatReportsService } from './chat-reports.service';
import { ChatPeopleController, ChatSettingsController } from './chat-settings.controller';
import { ChatSettingsService } from './chat-settings.service';
import { ChatStream } from './chat-stream';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** Private chat between members (M11). Rooms and group chats arrive with their milestones. */
@Module({
  imports: [AccessModule, AuthModule, NotificationsModule, ProfilesModule],
  controllers: [
    ChatController,
    ChatPeopleController,
    ChatSettingsController,
    ChatReportsController,
    ChatAdminController,
  ],
  providers: [
    ChatService,
    ChatSettingsService,
    ChatReportsService,
    ChatNotifier,
    ChatAccess,
    ChatStream,
  ],
})
export class ChatModule {}
