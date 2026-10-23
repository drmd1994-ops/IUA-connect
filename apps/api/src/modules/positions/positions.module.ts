import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { NotificationsModule } from '../notifications';
import { PositionsAdminController } from './positions-admin.controller';
import { PositionsAdminService } from './positions-admin.service';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

/** Jobs, fellowships and research posts (M28): their review, the list and saving. */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PositionsController, PositionsAdminController],
  providers: [PositionsService, PositionsAdminService],
})
export class PositionsModule {}
