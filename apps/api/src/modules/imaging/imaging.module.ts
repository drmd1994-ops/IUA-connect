import { Module } from '@nestjs/common';
import { ScanViewerController, ScansController } from './imaging.controller';
import { ImagingService } from './imaging.service';
import { UnusedScansJob } from './unused-scans.job';

/** Medical imaging (M36): de-identified scans and the viewer's way to read them. */
@Module({
  controllers: [ScansController, ScanViewerController],
  providers: [ImagingService, UnusedScansJob],
  exports: [ImagingService],
})
export class ImagingModule {}
