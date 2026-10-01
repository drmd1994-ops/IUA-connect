import { type DynamicModule, Global, Module } from '@nestjs/common';
import { type Env } from '../../config/env.schema';
import { JobQueue } from './job-queue';
import { ManualQueue } from './manual-queue';
import { PgBossQueue } from './pg-boss-queue';

/** JOB_QUEUE selects the adapter (pgboss, or manual for tests; manual is refused in production). */
@Global()
@Module({})
export class JobsModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: JobsModule,
      providers: [
        { provide: JobQueue, useClass: env.JOB_QUEUE === 'pgboss' ? PgBossQueue : ManualQueue },
      ],
      exports: [JobQueue],
    };
  }
}
