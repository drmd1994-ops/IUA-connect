import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaClient } from '../../generated/prisma/client';
import { createPgAdapter } from './pg-adapter';

/**
 * Database access for the API, connected as the application role (DATABASE_URL).
 * Modules use it only for the tables they own (ARCHITECTURE.md §1).
 * The connection pool opens lazily on the first query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) env: Env) {
    super({ adapter: createPgAdapter(env.DATABASE_URL) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
