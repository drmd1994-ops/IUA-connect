import { Module } from '@nestjs/common';
import { ChatModule } from '../chat';
import { NotificationsModule } from '../notifications';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';

/** Mentors, requests and the mentorships they become (M28). */
@Module({
  imports: [ChatModule, NotificationsModule],
  controllers: [MentorshipController],
  providers: [MentorshipService],
})
export class MentorshipModule {}
