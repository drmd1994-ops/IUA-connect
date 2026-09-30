import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { FilesController, ProfilePhotoController } from './files.controller';
import { FilesService } from './files.service';
import { ProfilePhotoService } from './profile-photo.service';

/** Files: uploads, signed downloads, access rules, profile photos (M3). */
@Module({
  imports: [AuthModule],
  controllers: [FilesController, ProfilePhotoController],
  providers: [FilesService, ProfilePhotoService],
  exports: [FilesService],
})
export class FilesModule {}
