import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { EducationAdminController, EducationPublicController } from './education.controller';
import { EducationAdminService } from './education-admin.service';
import { EducationPublicService } from './education-public.service';
import {
  ExamAdminController,
  ExamPracticeController,
  ExamResultsController,
} from './exam.controller';
import { ExamAdminService } from './exam-admin.service';
import { ExamPracticeService } from './exam-practice.service';

/** Education: the library, courses, the review workflow and the exam question demo (M6). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [
    EducationAdminController,
    EducationPublicController,
    ExamAdminController,
    ExamPracticeController,
    ExamResultsController,
  ],
  providers: [EducationAdminService, EducationPublicService, ExamAdminService, ExamPracticeService],
  exports: [EducationAdminService, EducationPublicService],
})
export class EducationModule {}
