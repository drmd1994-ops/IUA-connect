import { Module } from '@nestjs/common';
import { FilesModule } from '../files';
import { ImagingModule } from '../imaging';
import { NotificationsModule } from '../notifications';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

/** Case discussions (M26): cases, their review, pictures, poll and reports. */
@Module({
  imports: [FilesModule, ImagingModule, NotificationsModule],
  controllers: [CasesController],
  providers: [CasesService],
})
export class CasesModule {}
