import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { JobQueue } from '../../infra/jobs/job-queue';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Notifier } from '../notifications';
import {
  CONFERENCE_RETENTION_MS,
  SESSION_REMINDER_LEAD_MS,
  sessionReminderDue,
} from './conference-rules';

export const SESSION_REMINDERS_JOB = 'events.send-session-reminders';
export const CONFERENCE_CLEANUP_JOB = 'events.clean-conference-data';

/**
 * Every few minutes: a notice in the app ten minutes before a session in someone's schedule
 * (M32). No email: it would come too often, and too late to be read. And once a day: questions
 * and guests go 30 days after their event (the owner's answer, plan §10).
 */
@Injectable()
export class ConferenceJobs implements OnModuleInit {
  private readonly logger = new Logger(ConferenceJobs.name);

  constructor(
    private readonly jobs: JobQueue,
    private readonly prisma: PrismaService,
    private readonly notifier: Notifier,
  ) {}

  onModuleInit(): void {
    this.jobs.recurring({
      name: SESSION_REMINDERS_JOB,
      cron: '*/2 * * * *',
      run: async () => {
        const sent = await this.sendReminders();
        if (sent) this.logger.log({ sent }, 'Sent session reminders');
      },
    });
    this.jobs.recurring({
      name: CONFERENCE_CLEANUP_JOB,
      cron: '20 3 * * *',
      run: async () => {
        const removed = await this.cleanUp();
        if (removed.questions || removed.guests) this.logger.log(removed, 'Removed event data');
      },
    });
  }

  async sendReminders(now = new Date()): Promise<number> {
    const items = await this.prisma.scheduleItem.findMany({
      where: {
        session: {
          startAt: { gt: now, lte: new Date(now.getTime() + SESSION_REMINDER_LEAD_MS) },
          event: { status: 'PUBLISHED' },
        },
      },
      select: {
        userId: true,
        sessionId: true,
        user: { select: { email: true, locale: true } },
        session: {
          select: {
            startAt: true,
            room: true,
            translations: true,
            event: { select: { slug: true } },
          },
        },
      },
    });
    let sent = 0;
    for (const item of items) {
      if (!sessionReminderDue(item.session.startAt, now)) continue;
      const claimed = await this.prisma.sessionReminder.createMany({
        data: { sessionId: item.sessionId, userId: item.userId },
        skipDuplicates: true,
      });
      // Another run got there first: it sends this one.
      if (claimed.count === 0) continue;
      const wants = await this.notifier.channels(item.userId, 'MY_EVENTS');
      if (!wants.APP) continue;
      const text =
        item.session.translations.find((t) => t.locale === item.user.locale) ??
        item.session.translations.find((t) => t.locale === 'he') ??
        item.session.translations[0];
      await this.prisma.notification.create({
        data: {
          id: uuidv7(),
          userId: item.userId,
          kind: 'MY_EVENTS',
          type: 'sessionReminder',
          params: { title: text?.title ?? '', place: item.session.room ?? '—' },
          link: `/events/${item.session.event.slug}`,
        },
      });
      sent += 1;
    }
    return sent;
  }

  async cleanUp(now = new Date()): Promise<{ questions: number; guests: number }> {
    const before = new Date(now.getTime() - CONFERENCE_RETENTION_MS);
    const questions = await this.prisma.sessionQuestion.deleteMany({
      where: { session: { event: { endAt: { lt: before } } } },
    });
    const guests = await this.prisma.user.deleteMany({
      where: { conferenceGuest: { event: { endAt: { lt: before } } } },
    });
    return { questions: questions.count, guests: guests.count };
  }
}
