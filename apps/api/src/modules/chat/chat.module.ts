import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { ProfilesModule } from '../profiles';
import { ChatAccess } from './chat-access';
import { ChatStream } from './chat-stream';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** Private chat between members (M11). Rooms and group chats arrive with their milestones. */
@Module({
  imports: [AccessModule, AuthModule, ProfilesModule],
  controllers: [ChatController],
  providers: [ChatService, ChatAccess, ChatStream],
})
export class ChatModule {}
