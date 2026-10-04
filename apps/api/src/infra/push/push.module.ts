import { Global, Module } from '@nestjs/common';
import { DisabledPushProvider, PushProvider } from './push-provider';

/** PUSH_PROVIDER=disabled is the only implementation so far (allowed in production). */
@Global()
@Module({
  providers: [{ provide: PushProvider, useClass: DisabledPushProvider }],
  exports: [PushProvider],
})
export class PushModule {}
