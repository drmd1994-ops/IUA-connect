import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications';
import { PublicationsModule } from '../publications';
import { JournalClubAdminController, JournalClubController } from './journal-club.controller';
import { JournalClubService } from './journal-club.service';

/** The journal club (M31): entries, their review, the poll and their discussion posts. */
@Module({
  imports: [NotificationsModule, PublicationsModule],
  controllers: [JournalClubController, JournalClubAdminController],
  providers: [JournalClubService],
})
export class JournalClubModule {}
