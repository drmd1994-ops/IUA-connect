import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { JobQueue, type RecurringJob } from './job-queue';

/** pg-boss's own schema (created by a migration, owned by the application role). */
const SCHEMA = 'pgboss';

/**
 * JOB_QUEUE=pgboss: jobs stored in PostgreSQL (ADR 0003). pg-boss installs and upgrades its tables
 * at start. Schedules are kept in the database, so several API instances run each job once.
 */
@Injectable()
export class PgBossQueue extends JobQueue implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private readonly jobs = new Map<string, RecurringJob>();
  private readonly boss: PgBoss;

  constructor(@Inject(APP_CONFIG) env: Env) {
    super();
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: SCHEMA,
      // The migration created the schema; the app role may only create objects inside it.
      createSchema: false,
      migrate: true,
    });
    this.boss.on('error', (error: unknown) => this.logger.error({ err: error }, 'Job queue error'));
  }

  recurring(job: RecurringJob): void {
    if (this.jobs.has(job.name)) throw new Error(`Job ${job.name} is registered twice`);
    this.jobs.set(job.name, job);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    for (const job of this.jobs.values()) {
      await this.boss.createQueue(job.name);
      await this.boss.schedule(job.name, job.cron);
      await this.boss.work(job.name, async () => {
        await job.run();
      });
    }
    this.logger.log({ jobs: [...this.jobs.keys()] }, 'Job queue started');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 10_000 });
  }

  async runNow(name: string): Promise<void> {
    if (!this.jobs.has(name)) throw new Error(`Unknown job ${name}`);
    await this.boss.send(name, {});
  }
}
