import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController, MyMembershipController } from './membership.controller';
import { MembershipsAdminController } from './memberships-admin.controller';
import { MembershipsAdminService } from './memberships-admin.service';
import { MembershipsService } from './memberships.service';

/** Memberships, the application workflow and admin management (M2). */
@Module({
  controllers: [MyMembershipController, ApplicationsController, MembershipsAdminController],
  providers: [ApplicationsService, MembershipsService, MembershipsAdminService],
  exports: [MembershipsService],
})
export class MembershipModule {}
