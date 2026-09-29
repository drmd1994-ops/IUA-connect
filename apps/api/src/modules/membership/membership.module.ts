import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CardTokenController, CardVerifyController } from './card.controller';
import { CardService } from './card.service';
import { ApplicationsController, MyMembershipController } from './membership.controller';
import { MembershipsAdminController } from './memberships-admin.controller';
import { MembershipsAdminService } from './memberships-admin.service';
import { MembershipsService } from './memberships.service';

/** Memberships, the application workflow, admin management and the digital card (M2). */
@Module({
  controllers: [
    MyMembershipController,
    ApplicationsController,
    MembershipsAdminController,
    CardTokenController,
    CardVerifyController,
  ],
  providers: [ApplicationsService, MembershipsService, MembershipsAdminService, CardService],
  exports: [MembershipsService],
})
export class MembershipModule {}
