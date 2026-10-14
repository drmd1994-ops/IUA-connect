import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { NotificationsModule } from '../notifications';
import {
  MedicalSchoolsController,
  MyInvitationsController,
  MyVerificationController,
  PhysicianVerificationsController,
} from './verification.controller';
import { InvitationsService } from './invitations.service';
import { VerificationExpiryJob } from './verification-expiry.job';
import { VerificationService } from './verification.service';

/** The platform's own verification of physicians and medical students (M17). */
@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [
    MyVerificationController,
    MedicalSchoolsController,
    PhysicianVerificationsController,
    MyInvitationsController,
  ],
  providers: [VerificationService, VerificationExpiryJob, InvitationsService],
})
export class VerificationModule {}
