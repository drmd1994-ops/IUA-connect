import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { FilesModule } from '../files';
import { NewsAdminController } from './news-admin.controller';
import { NewsAdminService } from './news-admin.service';
import { NewsCategoriesService } from './news-categories.service';

/** News: editing, review workflow, scheduled publishing and public reads (M3). */
@Module({
  imports: [AccessModule, FilesModule],
  controllers: [NewsAdminController],
  providers: [NewsAdminService, NewsCategoriesService],
  exports: [NewsAdminService],
})
export class NewsModule {}
