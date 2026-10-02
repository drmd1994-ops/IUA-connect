import { Module } from '@nestjs/common';
import { AccessModule } from '../access';
import { AuthModule } from '../auth';
import { FilesModule } from '../files';
import { ConsentsController, DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

/** Member profiles (M2 checkpoint 2) and the opt-in member directory (M7). */
@Module({
  imports: [AccessModule, AuthModule, FilesModule],
  controllers: [ProfilesController, DirectoryController, ConsentsController],
  providers: [ProfilesService, DirectoryService],
  exports: [ProfilesService, DirectoryService],
})
export class ProfilesModule {}
