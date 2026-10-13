import { Global, Module } from '@nestjs/common';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';

/**
 * Organisations and their sections (M16). Global, like the database: almost every module that
 * owns something an organisation can own asks it which organisation a request is about.
 */
@Global()
@Module({
  controllers: [OrganisationsController],
  providers: [OrganisationsService],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
