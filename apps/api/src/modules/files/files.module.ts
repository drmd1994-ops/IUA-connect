import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { FilesController, ProfilePhotoController } from './files.controller';
import { FilesService } from './files.service';
import { ProfilePhotoService } from './profile-photo.service';
import { UnusedFilesJob } from './unused-files.job';

/** Files: uploads, signed downloads, access rules, profile photos (M3). */
@Module({
  imports: [AuthModule],
  controllers: [FilesController, ProfilePhotoController],
  providers: [FilesService, ProfilePhotoService, UnusedFilesJob],
  exports: [FilesService],
})
export class FilesModule {}
