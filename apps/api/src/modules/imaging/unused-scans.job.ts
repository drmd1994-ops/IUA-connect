import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../infra/jobs/job-queue';
import { UNUSED_FILE_TTL_MS } from '../files';
import { ImagingService } from './imaging.service';

export const UNUSED_SCANS_JOB = 'imaging.remove-unused';

/** Hourly: removes scans never attached to a case or a library item, a day after upload. */
@Injectable()
export class UnusedScansJob implements OnModuleInit {
  private readonly logger = new Logger(UnusedScansJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly imaging: ImagingService,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: UNUSED_SCANS_JOB,
      cron: '23 * * * *',
      run: async () => {
        await this.run();
      },
    });
  }

  async run(now = new Date()): Promise<number> {
    const count = await this.imaging.removeUnattached(new Date(now.getTime() - UNUSED_FILE_TTL_MS));
    if (count) this.logger.log({ count }, 'Removed unused scans');
    return count;
  }
}
