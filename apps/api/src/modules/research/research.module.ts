import { Module } from '@nestjs/common';
import { ChatModule } from '../chat';
import { NotificationsModule } from '../notifications';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';

/** Research projects and requests to join them (M27). */
@Module({
  imports: [ChatModule, NotificationsModule],
  controllers: [ResearchController],
  providers: [ResearchService],
})
export class ResearchModule {}
