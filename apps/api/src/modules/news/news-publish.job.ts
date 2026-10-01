import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../infra/jobs/job-queue';
import { NewsAdminService } from './news-admin.service';

export const NEWS_PUBLISH_JOB = 'news.publish-due';

/**
 * Every minute: publishes scheduled items whose time has come. Running late (the API was down)
 * or twice is harmless: the next run publishes whatever is due, each item once.
 */
@Injectable()
export class NewsPublishJob implements OnModuleInit {
  private readonly logger = new Logger(NewsPublishJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly news: NewsAdminService,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: NEWS_PUBLISH_JOB,
      cron: '* * * * *',
      run: async () => {
        const count = await this.news.publishDue();
        if (count) this.logger.log({ count }, 'Published scheduled news');
      },
    });
  }
}
