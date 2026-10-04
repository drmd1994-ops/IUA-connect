import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatPeopleController, ChatSettingsController } from './chat-settings.controller';
import { ChatSettingsService } from './chat-settings.service';
import { ChatStream } from './chat-stream';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** Private chat between members (M11). Rooms and group chats arrive with their milestones. */
@Module({
  imports: [AccessModule, AuthModule, ProfilesModule],
  controllers: [ChatController, ChatPeopleController, ChatSettingsController],
  providers: [ChatService, ChatSettingsService, ChatAccess, ChatStream],
})
export class ChatModule {}
