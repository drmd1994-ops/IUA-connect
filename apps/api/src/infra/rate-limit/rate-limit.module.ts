import { Global, Module } from '@nestjs/common';
import { MemoryRateLimitStore, RateLimitStore } from './rate-limit.store';

/** RATE_LIMIT_STORE=memory is the only implementation so far (refused in production). */
@Global()
@Module({
  providers: [{ provide: RateLimitStore, useClass: MemoryRateLimitStore }],
  exports: [RateLimitStore],
})
export class RateLimitModule {}
