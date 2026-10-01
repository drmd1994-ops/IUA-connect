/**
 * Background jobs (ARCHITECTURE.md §5, ADR 0003). Modules register recurring jobs while the app
 * starts (in onModuleInit); the queue runs them on schedule. A job must be safe to run twice and
 * must finish what an earlier, interrupted run left (e.g. publish everything that is due), so a
 * missed or repeated run never matters.
 */
export interface RecurringJob {
  /** Queue name, e.g. "news.publish-due". */
  name: string;
  /** Standard 5-field cron expression, in UTC. */
  cron: string;
  run: () => Promise<void>;
}

export abstract class JobQueue {
  abstract recurring(job: RecurringJob): void;
  /** Runs a registered job now (through the queue when there is one). */
  abstract runNow(name: string): Promise<void>;
}
