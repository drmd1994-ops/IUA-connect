'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { downloadFile, useEventTime } from './shared';

type Schedule = components['schemas']['MyScheduleDto']['items'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

export function MySchedule() {
  return <RequireSignIn>{() => <ScheduleView />}</RequireSignIn>;
}

function ScheduleView() {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const { range, time, day } = useEventTime();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Schedule | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/schedule', { params: { query: { locale } } }))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, locale]);

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('events.schedule.title')}</h1>
        <p className="mt-2 text-text-muted">{t('events.schedule.intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && items.length === 0 && (
        <>
          <p className="text-text-muted">{t('events.schedule.empty')}</p>
          <Link href="/events" className={link}>
            {t('events.schedule.browse')}
          </Link>
        </>
      )}
      {items && items.length > 0 && (
        <>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDownloadError(false);
                downloadFile(`/api/v1/me/schedule.ics?locale=${locale}`, 'my-schedule.ics').catch(
                  () => setDownloadError(true),
                );
              }}
            >
              {t('events.schedule.download')}
            </Button>
            {downloadError && <Alert tone="error">{t('errors.internal')}</Alert>}
          </div>
          <ul className="flex flex-col gap-4" data-testid="my-schedule">
            {items.map((event) => (
              <li key={event.slug} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    <Link
                      href={`/events/${encodeURIComponent(event.slug)}`}
                      className="text-primary underline underline-offset-4"
                    >
                      {event.title}
                    </Link>
                  </h2>
                  <span className="flex flex-wrap gap-2">
                    {event.cancelled && (
                      <span className={`${badge} bg-danger-100 text-danger-700`}>
                        {t('events.schedule.cancelled')}
                      </span>
                    )}
                    {event.status === 'WAITLISTED' && (
                      <span className={`${badge} bg-warning-100 text-warning-700`}>
                        {t('events.schedule.waiting')}
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  {range(event.startAt, event.endAt, event.timezone)}
                  {event.locationName && ` · ${event.locationName}`}
                </p>
                {event.sessions.length === 0 ? (
                  <p className="mt-3 text-sm text-text-muted">{t('events.schedule.noSessions')}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {event.sessions.map((session) => (
                      <li key={session.id} className="rounded-md border border-border p-3">
                        <p className="text-sm text-text-muted">
                          {day(session.startAt, event.timezone)}
                          {' · '}
                          <span dir="ltr">
                            {time(session.startAt, event.timezone)}–
                            {time(session.endAt, event.timezone)}
                          </span>
                          {session.room && ` · ${t('events.event.room', { room: session.room })}`}
                        </p>
                        <p className="font-semibold">{session.title}</p>
                        {session.overlaps && (
                          <p className="mt-1">
                            <span className={`${badge} bg-warning-100 text-warning-700`}>
                              {t('events.schedule.overlap')}
                            </span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </PageFrame>
  );
}
