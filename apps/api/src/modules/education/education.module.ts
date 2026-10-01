import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { EducationAdminController, EducationPublicController } from './education.controller';
import { EducationAdminService } from './education-admin.service';
import { EducationPublicService } from './education-public.service';

/** Education: the library, courses and the review workflow (M6). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [EducationAdminController, EducationPublicController],
  providers: [EducationAdminService, EducationPublicService],
  exports: [EducationAdminService, EducationPublicService],
})
export class EducationModule {}
