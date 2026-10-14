import { Inject, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, isLocale } from '@medconnect/i18n';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { type EmailTemplates } from '../../infra/mailer/mailer';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Notifier } from '../notifications';

type EventTemplate =
  | 'eventRegistered'
  | 'eventWaitlisted'
  | 'eventPromoted'
  | 'eventCancelled'
  | 'eventChanged'
  | 'eventReminder';

/**
 * Notices about one event to one person, in the app and by email as they chose, in their
 * language (M5 plan §2.7; M7 plan §2.4). The event's time is
 * written in the event's own time zone. A failed email never undoes the action that caused it.
 */
@Injectable()
export class EventMailer {
  private readonly logger = new Logger(EventMailer.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly notifier: Notifier,
  ) {}

  async send(
    userId: string,
    template: EventTemplate,
    eventId: string,
    extra: { reason?: string } = {},
  ): Promise<void> {
    try {
      const [user, event] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, locale: true },
        }),
        this.prisma.event.findUnique({ where: { id: eventId }, include: { translations: true } }),
      ]);
      if (!user || !event) return;
      const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
      const text =
        event.translations.find((t) => t.locale === locale) ??
        event.translations.find((t) => t.locale === 'he') ??
        event.translations[0];
      if (!text) return;
      const params = {
        title: text.title,
        when: event.startAt ? formatWhen(event.startAt, locale, event.timezone) : '',
        place: event.locationName ?? '—',
        reason: extra.reason ?? '',
        link: new URL(`/${locale}/events/${event.slug}`, this.env.APP_BASE_URL).toString(),
      };
      await this.notifier.send({
        userId,
        kind: 'MY_EVENTS',
        to: user.email,
        locale,
        template,
        // Every event template takes a subset of these parameters.
        params: params as EmailTemplates[EventTemplate],
      });
    } catch (error) {
      this.logger.warn({ err: error, template, eventId }, 'Event email failed');
    }
  }
}

/** "Thursday, 10 January 2030 at 09:00" in the reader's language and the event's time zone. */
export function formatWhen(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(instant);
}
