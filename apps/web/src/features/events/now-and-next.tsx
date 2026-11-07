'use client';

import { eventRunning, nowAndNext } from '@medconnect/api-client/conference';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';

const REFRESH_MS = 30_000;
const link = 'font-semibold text-primary underline underline-offset-4';

interface Timed {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  room?: string | null;
  locale?: string;
}

/**
 * While an event runs: what is on and what is next, then the sessions the person chose, first on
 * its page (M32). Follows the clock by itself.
 */
export function NowAndNext({
  slug,
  event,
  sessions,
  chosen,
}: {
  slug: string;
  event: { startAt: string; endAt: string; timezone: string };
  sessions: Timed[];
  chosen: readonly string[];
}) {
  const t = useTranslations('events.live');
  const format = useFormatter();
  const [now, setNow] = useState<Date | null>(null);

  // On the client only: the server's clock and time zone must not decide what the page shows.
  useEffect(() => {
    const first = window.setTimeout(() => setNow(new Date()), 0);
    const timer = window.setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  if (!now || sessions.length === 0 || !eventRunning(event, now)) return null;
  const { now: on, next } = nowAndNext(sessions, now);
  const mine = sessions.filter(
    (session) => chosen.includes(session.id) && Date.parse(session.endAt) > now.getTime(),
  );

  const line = (session: Timed) => (
    <li key={session.id} className="flex flex-col gap-1">
      <span className="text-sm text-text-muted">
        {format.dateTimeRange(new Date(session.startAt), new Date(session.endAt), {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: event.timezone,
        })}
        {session.room && ` · ${t('room', { room: session.room })}`}
      </span>
      <Link href={`/events/${encodeURIComponent(slug)}/sessions/${session.id}`} className={link}>
        <span lang={session.locale}>{session.title}</span>
      </Link>
    </li>
  );

  return (
    <section
      aria-labelledby="now-title"
      className="flex flex-col gap-4 rounded-md border border-border p-4"
      data-testid="now-and-next"
    >
      {mine.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t('mySchedule')}</h2>
          <ul className="flex flex-col gap-2">{mine.map(line)}</ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 id="now-title" className="text-xl font-semibold">
          {t('now')}
        </h2>
        {on.length === 0 ? (
          <p className="text-text-muted">{t('nothingNow')}</p>
        ) : (
          <ul className="flex flex-col gap-2">{on.map(line)}</ul>
        )}
      </div>
      {next.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t('next')}</h2>
          <ul className="flex flex-col gap-2">{next.map(line)}</ul>
        </div>
      )}
    </section>
  );
}
