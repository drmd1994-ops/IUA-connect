import { Module } from '@nestjs/common';
import { AccessService } from './access.service';

/** Content access tiers (M3), shared by news, guidelines and later events and education. */
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
