import { Injectable } from '@nestjs/common';
import { JobQueue, type RecurringJob } from './job-queue';

/**
 * JOB_QUEUE=manual: nothing runs on schedule; runNow() runs the job in place. For tests and the
 * OpenAPI export (no database needed). Refused in production.
 */
@Injectable()
export class ManualQueue extends JobQueue {
  private readonly jobs = new Map<string, RecurringJob>();

  recurring(job: RecurringJob): void {
    if (this.jobs.has(job.name)) throw new Error(`Job ${job.name} is registered twice`);
    this.jobs.set(job.name, job);
  }

  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Unknown job ${name}`);
    await job.run();
  }

  /** Registered job names (for tests). */
  names(): string[] {
    return [...this.jobs.keys()];
  }
}
