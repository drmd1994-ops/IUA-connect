import { Global, Module } from '@nestjs/common';
import { PgRealtimeBus, RealtimeBus } from './realtime-bus';

/** PostgreSQL notify and listen is the only implementation so far (allowed in production). */
@Global()
@Module({
  providers: [{ provide: RealtimeBus, useClass: PgRealtimeBus }],
  exports: [RealtimeBus],
})
export class RealtimeModule {}
