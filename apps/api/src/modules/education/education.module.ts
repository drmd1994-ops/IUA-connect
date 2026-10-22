import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import { EducationAdminController, EducationPublicController } from './education.controller';
import { EducationAdminService } from './education-admin.service';
import { EducationPublicService } from './education-public.service';
import {
  ExamAdminController,
  ExamBookmarksController,
  ExamPracticeController,
  ExamResultsController,
} from './exam.controller';
import { ExamAdminService } from './exam-admin.service';
import { ExamPracticeService } from './exam-practice.service';
import { MockExamController } from './mock-exam.controller';
import { MockExamService } from './mock-exam.service';

/** Education: the library, courses, the review workflow and the exam question demo (M6). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule, NotificationsModule],
  controllers: [
    EducationAdminController,
    EducationPublicController,
    ExamAdminController,
    ExamBookmarksController,
    ExamPracticeController,
    ExamResultsController,
    MockExamController,
  ],
  providers: [
    EducationAdminService,
    EducationPublicService,
    ExamAdminService,
    ExamPracticeService,
    MockExamService,
  ],
  exports: [EducationAdminService, EducationPublicService],
})
export class EducationModule {}
