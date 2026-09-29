import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController, MyMembershipController } from './membership.controller';
import { MembershipsService } from './memberships.service';

/** Memberships and the application workflow (M2). */
@Module({
  controllers: [MyMembershipController, ApplicationsController],
  providers: [ApplicationsService, MembershipsService],
  exports: [MembershipsService],
})
export class MembershipModule {}
