import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../infra/jobs/job-queue';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { FilesService } from './files.service';

export const UNUSED_FILES_JOB = 'files.remove-unused';
/** An upload nothing uses after this long is removed (M3 plan §4). */
export const UNUSED_FILE_TTL_MS = 24 * 60 * 60 * 1000;

/** Hourly: removes uploads that were never attached to anything. */
@Injectable()
export class UnusedFilesJob implements OnModuleInit {
  private readonly logger = new Logger(UnusedFilesJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: UNUSED_FILES_JOB,
      cron: '17 * * * *',
      run: async () => {
        await this.run();
      },
    });
  }

  async run(now = new Date()): Promise<number> {
    const stale = await this.prisma.storedFile.findMany({
      where: {
        attachedAt: null,
        createdAt: { lt: new Date(now.getTime() - UNUSED_FILE_TTL_MS) },
        profilePhoto: null,
      },
      select: { id: true },
      take: 500,
    });
    for (const file of stale) await this.files.remove(file.id);
    if (stale.length) this.logger.log({ count: stale.length }, 'Removed unused uploads');
    return stale.length;
  }
}
