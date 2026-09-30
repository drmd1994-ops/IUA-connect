import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ApplicationsService } from './applications.service';
import { CardTokenController, CardVerifyController } from './card.controller';
import { CardService } from './card.service';
import { ImportController } from './import/import.controller';
import { ImportService } from './import/import.service';
import { ApplicationsController, MyMembershipController } from './membership.controller';
import { MembershipsAdminController } from './memberships-admin.controller';
import { MembershipsAdminService } from './memberships-admin.service';
import { MembershipsService } from './memberships.service';

/** Memberships, the application workflow, admin management, the digital card and CSV import (M2). */
@Module({
  imports: [AuthModule],
  controllers: [
    ImportController,
    MyMembershipController,
    ApplicationsController,
    MembershipsAdminController,
    CardTokenController,
    CardVerifyController,
  ],
  providers: [
    ApplicationsService,
    MembershipsService,
    MembershipsAdminService,
    CardService,
    ImportService,
  ],
  exports: [MembershipsService],
})
export class MembershipModule {}
