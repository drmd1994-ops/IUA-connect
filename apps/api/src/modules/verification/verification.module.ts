import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import {
  MedicalSchoolsController,
  MyVerificationController,
  PhysicianVerificationsController,
} from './verification.controller';
import { VerificationExpiryJob } from './verification-expiry.job';
import { VerificationService } from './verification.service';

/** The platform's own verification of physicians and medical students (M17). */
@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [
    MyVerificationController,
    MedicalSchoolsController,
    PhysicianVerificationsController,
  ],
  providers: [VerificationService, VerificationExpiryJob],
})
export class VerificationModule {}
