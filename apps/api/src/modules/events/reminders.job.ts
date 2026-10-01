import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../infra/jobs/job-queue';
import { isUniqueViolation } from '../../infra/prisma/errors';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventMailer } from './event-mailer';
import { LONGEST_LEAD_MS, type ReminderKind, dueReminders } from './reminder-rules';

export const EVENT_REMINDERS_JOB = 'events.send-reminders';

/**
 * Every 15 minutes: emails registered people a week and a day before their events (M5 plan §2.7).
 * The sent-log row is written first, so a reminder goes out at most once, however often the job
 * runs. Cancelled events and people who cancelled or are only waiting get nothing.
 */
@Injectable()
export class EventRemindersJob implements OnModuleInit {
  private readonly logger = new Logger(EventRemindersJob.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly prisma: PrismaService,
    private readonly mailer: EventMailer,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: EVENT_REMINDERS_JOB,
      cron: '*/15 * * * *',
      run: async () => {
        const sent = await this.run();
        if (sent) this.logger.log({ sent }, 'Sent event reminders');
      },
    });
  }

  /** Sends what is due now and returns how many reminders went out. */
  async run(now = new Date()): Promise<number> {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        status: 'REGISTERED',
        // Read fresh on every run: a cancelled or unpublished event sends nothing.
        event: {
          status: 'PUBLISHED',
          startAt: { gt: now, lte: new Date(now.getTime() + LONGEST_LEAD_MS) },
        },
      },
      select: {
        eventId: true,
        userId: true,
        queuedAt: true,
        promotedAt: true,
        event: { select: { startAt: true } },
      },
    });
    if (registrations.length === 0) return 0;
    const log = await this.prisma.eventReminder.findMany({
      where: { eventId: { in: [...new Set(registrations.map((r) => r.eventId))] } },
      select: { eventId: true, userId: true, kind: true },
    });
    const sentBefore = new Map<string, ReminderKind[]>();
    for (const row of log) {
      const key = `${row.eventId}:${row.userId}`;
      sentBefore.set(key, [...(sentBefore.get(key) ?? []), row.kind]);
    }

    let sent = 0;
    for (const registration of registrations) {
      const kinds = dueReminders({
        startAt: registration.event.startAt!,
        placedAt: registration.promotedAt ?? registration.queuedAt,
        now,
        sent: sentBefore.get(`${registration.eventId}:${registration.userId}`) ?? [],
      });
      for (const kind of kinds) {
        try {
          await this.prisma.eventReminder.create({
            data: { eventId: registration.eventId, userId: registration.userId, kind },
          });
        } catch (error) {
          // Another run got there first: it sends this one.
          if (isUniqueViolation(error)) continue;
          throw error;
        }
        await this.mailer.send(registration.userId, 'eventReminder', registration.eventId);
        sent += 1;
      }
    }
    return sent;
  }
}
