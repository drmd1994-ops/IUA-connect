import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import { ProfilesModule } from '../profiles';
import { ActivityService } from './activity.service';
import { ChatAccess } from './chat-access';
import { ChatMessages } from './chat-messages';
import { ChatNotifier } from './chat-notifier';
import { ChatAdminController, ChatReportsController } from './chat-reports.controller';
import { ChatReportsService } from './chat-reports.service';
import { ChatPeopleController, ChatSettingsController } from './chat-settings.controller';
import { ChatSettingsService } from './chat-settings.service';
import { ChatStream } from './chat-stream';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { RoomNotifier } from './room-notifier';
import { RoomsAdminService } from './rooms-admin.service';
import { RoomsAdminController, RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

/**
 * Chat between members: private conversations (M11), rooms the association opens (M12), and
 * groups members make, invitations, activity and files in messages (M13).
 */
@Module({
  imports: [AccessModule, AuthModule, FilesModule, NotificationsModule, ProfilesModule],
  controllers: [
    ChatController,
    ChatPeopleController,
    ChatSettingsController,
    ChatReportsController,
    ChatAdminController,
    RoomsController,
    RoomsAdminController,
    GroupsController,
  ],
  providers: [
    ChatService,
    ChatMessages,
    ChatSettingsService,
    ChatReportsService,
    ChatNotifier,
    RoomsService,
    RoomsAdminService,
    RoomNotifier,
    GroupsService,
    InvitationsService,
    ActivityService,
    ChatAccess,
    ChatStream,
  ],
})
export class ChatModule {}
