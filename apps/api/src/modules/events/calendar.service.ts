import { Inject, Injectable } from '@nestjs/common';
import { type Principal } from '../../common/auth/principal';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventsPublicService } from './events-public.service';
import { type CalendarEntry, buildCalendar } from './ics';

type Locale = 'he' | 'en';

function pick<T extends { locale: string }>(rows: T[], locale: Locale): T {
  return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he') ?? rows[0]!;
}

interface EventLike {
  id: string;
  slug: string;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  locationName: string | null;
  address: string | null;
  lat: unknown;
  lng: unknown;
  updatedAt: Date;
  translations: { locale: string; title: string; summary: string | null }[];
}

/**
 * Calendar files (M5 plan §2.5): one for an event, one for the member's own schedule. IDs are
 * stable, so downloading again updates the entries in the reader's calendar.
 */
@Injectable()
export class CalendarService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly events: EventsPublicService,
  ) {}

  /** The event as one calendar entry. The caller must be allowed to see the event. */
  async eventCalendar(principal: Principal | null, slug: string, locale: Locale): Promise<string> {
    const event = await this.events.visible(principal, slug);
    const entry = this.eventEntry(event, locale);
    return buildCalendar(entry.title, [entry]);
  }

  /**
   * The caller's schedule: their chosen sessions, or the whole event where they chose none.
   * Events they are only waiting for are left out.
   */
  async scheduleCalendar(principal: Principal, locale: Locale): Promise<string> {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId: principal.userId,
        status: 'REGISTERED',
        event: { status: { in: ['PUBLISHED', 'CANCELLED'] } },
      },
      include: { event: { include: { translations: true } } },
      orderBy: { event: { startAt: 'asc' } },
    });
    const chosen = await this.prisma.scheduleItem.findMany({
      where: { userId: principal.userId },
      include: { session: { include: { translations: true } } },
      orderBy: { session: { startAt: 'asc' } },
    });
    const entries: CalendarEntry[] = [];
    for (const { event } of registrations) {
      const whole = this.eventEntry(event, locale);
      const sessions = chosen.filter(({ session }) => session.eventId === event.id);
      if (sessions.length === 0) {
        entries.push(whole);
        continue;
      }
      for (const { session } of sessions) {
        const text = pick(session.translations, locale);
        entries.push({
          uid: `session-${session.id}@iua-connect`,
          title: `${text.title} · ${whole.title}`,
          startAt: session.startAt,
          endAt: session.endAt,
          description: text.description,
          location: [session.room, whole.location].filter(Boolean).join(', ') || null,
          url: whole.url,
          cancelled: whole.cancelled,
          updatedAt: session.updatedAt,
        });
      }
    }
    return buildCalendar('IUA Connect', entries);
  }

  private eventEntry(event: EventLike, locale: Locale): CalendarEntry {
    const text = pick(event.translations, locale);
    return {
      uid: `event-${event.id}@iua-connect`,
      title: text.title,
      // Published and cancelled events always have their dates (a database rule).
      startAt: event.startAt!,
      endAt: event.endAt!,
      description: text.summary,
      location: [event.locationName, event.address].filter(Boolean).join(', ') || null,
      url: new URL(`/${locale}/events/${event.slug}`, this.env.APP_BASE_URL).toString(),
      geo:
        event.lat !== null && event.lng !== null
          ? { lat: Number(event.lat), lng: Number(event.lng) }
          : null,
      cancelled: event.status === 'CANCELLED',
      updatedAt: event.updatedAt,
    };
  }
}
