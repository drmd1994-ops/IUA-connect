import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../infra/jobs/job-queue';
import { VerificationService } from './verification.service';

export const VERIFICATION_EXPIRY_JOB = 'verification.look-again';

/**
 * Hourly (M17 step 7): tells people a month before their verification ends, and ends the ones
 * whose date passed. Safe to run twice.
 */
@Injectable()
export class VerificationExpiryJob implements OnModuleInit {
  private readonly logger = new Logger(VerificationExpiryJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly verification: VerificationService,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: VERIFICATION_EXPIRY_JOB,
      cron: '41 * * * *',
      run: async () => {
        await this.run();
      },
    });
  }

  async run(now = new Date()): Promise<{ reminded: number; ended: number }> {
    const reminded = await this.verification.remindDue(now);
    const ended = await this.verification.expireDue(now);
    if (reminded || ended) this.logger.log({ reminded, ended }, 'Verifications looked at again');
    return { reminded, ended };
  }
}
