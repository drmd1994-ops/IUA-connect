import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles';
import { OrcidSource, PubMedSource } from './publication-sources';
import { PublicationsController } from './publications.controller';
import { PublicationsService } from './publications.service';

/** Publications on profiles (M27), typed in or filled from PubMed and ORCID. */
@Module({
  imports: [ProfilesModule],
  controllers: [PublicationsController],
  providers: [PublicationsService, PubMedSource, OrcidSource],
  // The journal club (M31) fills its articles the same way, through the same queue.
  exports: [PubMedSource],
})
export class PublicationsModule {}
