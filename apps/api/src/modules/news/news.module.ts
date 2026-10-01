import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NewsAdminController } from './news-admin.controller';
import { NewsAdminService } from './news-admin.service';
import { NewsCategoriesService } from './news-categories.service';
import { NewsPublicController } from './news-public.controller';
import { NewsPublicService } from './news-public.service';
import { NewsPublishJob } from './news-publish.job';

/** News: editing, review workflow, scheduled publishing and public reads (M3). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [NewsAdminController, NewsPublicController],
  providers: [NewsAdminService, NewsCategoriesService, NewsPublicService, NewsPublishJob],
  exports: [NewsAdminService],
})
export class NewsModule {}
