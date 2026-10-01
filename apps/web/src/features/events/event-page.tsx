'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { StoredImage, formatSize, useFileUrl } from '@/features/content/files';
import { Markdown } from '@/features/content/markdown';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { downloadFile, useEventTime } from './shared';

type Schemas = components['schemas'];
type Event = Schemas['PublicEventDto'];
type Session = Schemas['PublicSessionListDto']['items'][number];
type Registration = Schemas['MyRegistrationDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

export function EventPage({ slug }: { slug: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const { api, call, status } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    const path = { path: { slug }, query: { locale } };
    Promise.all([
      call(() => api.GET('/api/v1/events/{slug}', { params: path })),
      call(() => api.GET('/api/v1/events/{slug}/sessions', { params: path })),
      status === 'signedIn'
        ? call(() => api.GET('/api/v1/events/{slug}/registration', { params: { path: { slug } } }))
        : null,
    ])
      .then(([loaded, list, mine]) => {
        if (!active) return;
        setEvent(loaded);
        setSessions(list.items);
        setRegistration(mine);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, slug, locale, version]);

  if (error !== null) {
    return (
      <PageFrame>
        {isApiError(error, 'NOT_FOUND') ? (
          <>
            <h1 className="text-3xl font-semibold text-brand-900">
              {t('content.common.notFoundTitle')}
            </h1>
            <p className="text-text-muted">{t('content.common.notFoundBody')}</p>
          </>
        ) : (
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        )}
        <Link href="/events" className={link}>
          {t('events.event.back')}
        </Link>
      </PageFrame>
    );
  }
  if (!event) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  return (
    <EventView
      event={event}
      sessions={sessions}
      registration={registration}
      onChanged={(next) => {
        setRegistration(next);
        // Places left and the waiting list may have changed.
        setVersion((v) => v + 1);
      }}
    />
  );
}

function EventView({
  event,
  sessions,
  registration,
  onChanged,
}: {
  event: Event;
  sessions: Session[];
  registration: Registration | null;
  onChanged: (registration: Registration) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { range } = useEventTime();
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const dir = event.locale === 'he' ? 'rtl' : 'ltr';
  const mapUrl =
    event.lat !== null && event.lng !== null
      ? `https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lng}#map=16/${event.lat}/${event.lng}`
      : null;

  return (
    <PageFrame>
      <Link href="/events" className={link}>
        {t('events.event.back')}
      </Link>
      {event.cancelled && (
        <Alert tone="warning">
          {t('events.event.cancelledNotice')}
          {event.cancelReason &&
            ` ${t('events.event.cancelReason', { reason: event.cancelReason })}`}
        </Alert>
      )}
      {event.fallback && <Alert>{t('content.common.fallbackNotice')}</Alert>}

      <article data-testid="event">
        <h1
          className="text-3xl font-semibold leading-tight text-brand-900"
          lang={event.locale}
          dir={dir}
        >
          {event.title}
        </h1>
        {event.imageFileId && (
          <StoredImage
            fileId={event.imageFileId}
            alt={t('events.event.imageAlt', { title: event.title })}
            className="mt-6 max-h-112 w-full rounded-lg object-cover"
          />
        )}
        <dl className="mt-6 grid gap-4 rounded-md border border-border p-5 sm:grid-cols-2">
          <Item label={t('events.event.when')}>
            {range(event.startAt, event.endAt, event.timezone)}
            <span className="block text-sm font-normal text-text-muted">
              {t('events.event.timeNote')}
            </span>
          </Item>
          {(event.locationName || event.address) && (
            <Item label={t('events.event.where')}>
              {event.locationName}
              {event.address && (
                <span className="block text-sm font-normal text-text-muted">{event.address}</span>
              )}
              {mapUrl && (
                <a href={mapUrl} className={`${link} block text-sm`} rel="noopener noreferrer">
                  {t('events.event.openMap')}
                </a>
              )}
            </Item>
          )}
          {event.organizer && <Item label={t('events.event.organizer')}>{event.organizer}</Item>}
          {event.cmeAvailable && (
            <Item label={t('events.list.cme')}>{t('membership.common.yes')}</Item>
          )}
        </dl>
        {event.summary && (
          <p className="mt-6 text-lg text-text-muted" lang={event.locale} dir={dir}>
            {event.summary}
          </p>
        )}
        <div lang={event.locale} dir={dir}>
          <Markdown>{event.description}</Markdown>
        </div>
      </article>

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDownloadError(null);
            downloadFile(
              `/api/v1/events/${encodeURIComponent(event.slug)}.ics?locale=${locale}`,
              'event.ics',
            ).catch((caught: unknown) => setDownloadError(caught));
          }}
        >
          {t('events.event.addToCalendar')}
        </Button>
        {downloadError !== null && <Alert tone="error">{t('errors.internal')}</Alert>}
      </div>

      {event.sourceUrl && (
        <p className="rounded-md border border-border p-4">
          <span className="block text-sm text-text-muted">{t('events.event.sourceLabel')}</span>
          <a href={event.sourceUrl} className={link} rel="noopener noreferrer">
            {t('events.event.readAtSource')}
          </a>
        </p>
      )}

      <RegistrationPanel event={event} registration={registration} onChanged={onChanged} />
      <Programme
        event={event}
        sessions={sessions}
        registration={registration}
        onChanged={onChanged}
      />
    </PageFrame>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function RegistrationPanel({
  event,
  registration,
  onChanged,
}: {
  event: Event;
  registration: Registration | null;
  onChanged: (registration: Registration) => void;
}) {
  const t = useTranslations();
  const r = (key: string, values?: Record<string, string | number>) =>
    t(`events.event.registration.${key}`, values);
  const { api, call, status } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const params = { params: { path: { slug: event.slug } } };

  async function attempt(request: () => Promise<Registration>) {
    setPending(true);
    setError(null);
    try {
      onChanged(await request());
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  let body: ReactNode;
  if (event.registrationMode === 'NONE') body = <p>{r('none')}</p>;
  else if (event.registrationMode === 'EXTERNAL') {
    body = (
      <>
        <p>{r('external')}</p>
        {event.registrationUrl && !event.cancelled && (
          <p>
            <a
              href={event.registrationUrl}
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
            >
              {r('externalLink')}
            </a>
          </p>
        )}
      </>
    );
  } else if (status !== 'signedIn') {
    body = (
      <>
        <p>{event.registrationOpen ? r('signIn') : r('closed')}</p>
        {event.registrationOpen && (
          <Link href="/login" className={link}>
            {t('membership.common.signIn')}
          </Link>
        )}
      </>
    );
  } else {
    const mine = registration?.status ?? 'NONE';
    const full = event.placesLeft === 0;
    body = (
      <>
        {mine === 'REGISTERED' && <Alert tone="success">{r('registered')}</Alert>}
        {mine === 'WAITLISTED' && (
          <Alert>{r('waiting', { position: registration?.waitingPosition ?? 1 })}</Alert>
        )}
        {mine === 'NONE' && !event.registrationOpen && <p>{r('closed')}</p>}
        {mine === 'NONE' && event.registrationOpen && (
          <p className="text-text-muted">
            {full
              ? r('full')
              : event.placesLeft !== null && r('placesLeft', { count: event.placesLeft })}
          </p>
        )}
        {event.registrationOpen && (
          <div>
            {mine === 'NONE' ? (
              <Button
                type="button"
                pending={pending}
                onClick={() =>
                  void attempt(() =>
                    call(() => api.POST('/api/v1/events/{slug}/registration', params)),
                  )
                }
              >
                {full ? r('joinWaitingList') : r('register')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                pending={pending}
                onClick={() =>
                  void attempt(() =>
                    call(() => api.DELETE('/api/v1/events/{slug}/registration', params)),
                  )
                }
              >
                {mine === 'WAITLISTED' ? r('leaveWaitingList') : r('cancel')}
              </Button>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="registration-title"
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      data-testid="event-registration"
    >
      <h2 id="registration-title" className="text-xl font-semibold">
        {r('title')}
      </h2>
      {body}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
    </section>
  );
}

function Programme({
  event,
  sessions,
  registration,
  onChanged,
}: {
  event: Event;
  sessions: Session[];
  registration: Registration | null;
  onChanged: (registration: Registration) => void;
}) {
  const t = useTranslations();
  const { day, time, dayKey } = useEventTime();
  const { api, call } = useAuth();
  const canChoose = registration?.status === 'REGISTERED';
  // The saved choice arrives with the registration (and empties when it is cancelled). When it
  // changes, the ticked boxes start again from it.
  const savedKey = registration?.sessionIds.join(',') ?? '';
  const [choice, setChoice] = useState({ from: savedKey, ids: registration?.sessionIds ?? [] });
  if (choice.from !== savedKey) {
    setChoice({ from: savedKey, ids: registration?.sessionIds ?? [] });
  }
  const chosen = choice.ids;
  const setChosen = (update: (current: string[]) => string[]) =>
    setChoice((current) => ({ ...current, ids: update(current.ids) }));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const days = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = dayKey(session.startAt, event.timezone);
    days.set(key, [...(days.get(key) ?? []), session]);
  }

  async function save() {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      onChanged(
        await call(() =>
          api.PUT('/api/v1/events/{slug}/schedule', {
            params: { path: { slug: event.slug } },
            body: { sessionIds: chosen },
          }),
        ),
      );
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="programme-title" className="flex flex-col gap-4">
      <h2 id="programme-title" className="text-xl font-semibold">
        {t('events.event.sessions')}
      </h2>
      {sessions.length === 0 && <p className="text-text-muted">{t('events.event.noSessions')}</p>}
      {canChoose && sessions.length > 0 && (
        <p className="text-sm text-text-muted">{t('events.event.schedule.hint')}</p>
      )}
      {[...days.entries()].map(([key, list]) => (
        <div key={key} className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">{day(list[0]!.startAt, event.timezone)}</h3>
          <ul className="flex flex-col gap-3" data-testid="event-sessions">
            {list.map((session) => (
              <li key={session.id} className="rounded-md border border-border p-4">
                <p className="text-sm text-text-muted">
                  <span dir="ltr">
                    {time(session.startAt, event.timezone)}–{time(session.endAt, event.timezone)}
                  </span>
                  {session.room && ` · ${t('events.event.room', { room: session.room })}`}
                </p>
                <p className="font-semibold" lang={session.locale}>
                  {session.title}
                </p>
                {session.description && (
                  <p className="mt-1 whitespace-pre-line" lang={session.locale}>
                    {session.description}
                  </p>
                )}
                {session.speakers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">{t('events.event.speakers')}</p>
                    <ul className="mt-1 flex flex-col gap-2">
                      {session.speakers.map((speaker) => (
                        <li key={speaker.id} className="flex items-start gap-3">
                          {speaker.photoFileId && (
                            <StoredImage
                              fileId={speaker.photoFileId}
                              variant="thumb"
                              alt=""
                              className="size-12 rounded-full object-cover"
                            />
                          )}
                          <span>
                            <span className="font-semibold">
                              {[speaker.title, speaker.name].filter(Boolean).join(' ')}
                            </span>
                            {speaker.affiliation && (
                              <span className="block text-sm text-text-muted">
                                {speaker.affiliation}
                              </span>
                            )}
                            {speaker.bio && <span className="block text-sm">{speaker.bio}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {session.materials.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold">{t('events.event.materials')}</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {session.materials.map((file) => (
                        <li key={file.id}>
                          <MaterialLink file={file} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {canChoose && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={chosen.includes(session.id)}
                      onChange={() => {
                        setSaved(false);
                        setChosen((current) =>
                          current.includes(session.id)
                            ? current.filter((id) => id !== session.id)
                            : [...current, session.id],
                        );
                      }}
                    />
                    {t('events.event.schedule.add', { title: session.title })}
                  </label>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {canChoose && sessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" pending={pending} onClick={() => void save()}>
            {t('events.event.schedule.save')}
          </Button>
          <Link href="/account/schedule" className={link}>
            {t('events.event.schedule.view')}
          </Link>
        </div>
      )}
      {saved && <Alert tone="success">{t('events.event.schedule.saved')}</Alert>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
    </section>
  );
}

function MaterialLink({ file }: { file: Session['materials'][number] }) {
  const t = useTranslations('content.common');
  const locale = useLocale();
  const url = useFileUrl(file.id);
  const label = `${file.originalName} (${formatSize(file.sizeBytes, locale)})`;
  if (!url) return <span className="text-text-muted">{label}</span>;
  return (
    <a href={url} className={link} download={file.originalName}>
      <span className="sr-only">{t('download')}: </span>
      {label}
    </a>
  );
}
