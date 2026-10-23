import { Module } from '@nestjs/common';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import { CommunitiesAdminController } from './communities-admin.controller';
import { CommunitiesService } from './communities.service';
import { CommunityController } from './community.controller';
import { CommunityNotifier } from './community-notifier';
import { PostsService } from './posts.service';

/** Professional communities (M25), which replace chat rooms. */
@Module({
  imports: [FilesModule, NotificationsModule],
  controllers: [CommunityController, CommunitiesAdminController],
  providers: [CommunitiesService, PostsService, CommunityNotifier],
})
export class CommunityModule {}
