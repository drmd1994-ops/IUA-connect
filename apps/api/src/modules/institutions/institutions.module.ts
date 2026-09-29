import { Module } from '@nestjs/common';
import { InstitutionsAdminController } from './institutions-admin.controller';
import { InstitutionsService } from './institutions.service';
import { ReferenceController } from './reference.controller';

/** Hospitals, departments, directors and the reference lists (M2). */
@Module({
  controllers: [ReferenceController, InstitutionsAdminController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
