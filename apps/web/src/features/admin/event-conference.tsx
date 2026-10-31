'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { QrCode } from '@/features/membership/qr-code';
import { errorMessage } from '@/lib/api-errors';

type GuestEntry = components['schemas']['GuestEntryAdminDto'];
type Session = components['schemas']['AdminSessionDto'];
type Locale = 'he' | 'en';

const DEMO_CONFERENCE_SLUG = 'demo-conference';
const field = 'rounded-md border border-border bg-surface p-2';

/** `datetime-local` works in the browser's own time; the server gets the exact moment. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Conference mode in an event's admin page: the guest entry, the chairs and the moderators. */
export function EventConference({ event }: { event: { id: string; slug: string } }) {
  const t = useTranslations('events.admin.conference');
  const all = useTranslations();
  const locale = useLocale() as Locale;
  const { api, call } = useAuth();
  const [entry, setEntry] = useState<GuestEntry | null>(null);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const path = { eventId: event.id };

  function show(result: GuestEntry) {
    setEntry(result);
    setFrom(toLocalInput(result.from));
    setUntil(toLocalInput(result.until));
  }

  useEffect(() => {
    call(() =>
      api.GET('/api/v1/admin/events/{eventId}/guest-entry', {
        params: { path: { eventId: event.id }, query: { locale } },
      }),
    )
      .then(show)
      .catch((caught: unknown) => setError(caught));
    call(() =>
      api.GET('/api/v1/admin/events/{eventId}/sessions', {
        params: { path: { eventId: event.id } },
      }),
    )
      .then((result) => setSessions(result.items))
      .catch(() => undefined);
  }, [api, call, event.id, locale]);

  async function act(action: () => Promise<GuestEntry>) {
    setPending(true);
    setError(null);
    try {
      show(await action());
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  function open(submit: FormEvent) {
    submit.preventDefault();
    void act(() =>
      call(() =>
        api.PUT('/api/v1/admin/events/{eventId}/guest-entry', {
          params: { path, query: { locale } },
          body: {
            from: new Date(from).toISOString(),
            until: new Date(until).toISOString(),
          },
        }),
      ),
    );
  }

  return (
    <section
      aria-labelledby="conference-title"
      className="flex flex-col gap-4 rounded-md border border-border p-4"
      data-testid="event-conference"
    >
      <h2 id="conference-title" className="text-xl font-semibold">
        {t('title')}
      </h2>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}

      {entry?.available && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">{t('guestTitle')}</h3>
          <p className="text-sm text-text-muted">{t('guestExplain')}</p>
          {event.slug === DEMO_CONFERENCE_SLUG && (
            <div className="flex flex-col gap-1">
              <div>
                <Button
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t('startConfirm'))) return;
                    void act(() =>
                      call(() =>
                        api.POST('/api/v1/admin/events/{eventId}/demonstration', {
                          params: { path, query: { locale } },
                        }),
                      ),
                    );
                  }}
                >
                  {t('start')}
                </Button>
              </div>
              <p className="text-sm text-text-muted">{t('startExplain')}</p>
            </div>
          )}
          <form className="flex flex-wrap items-end gap-3" onSubmit={open}>
            <label className="flex flex-col gap-1">
              <span>{t('from')}</span>
              <input
                className={field}
                type="datetime-local"
                required
                value={from}
                onChange={(input) => setFrom(input.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t('until')}</span>
              <input
                className={field}
                type="datetime-local"
                required
                value={until}
                onChange={(input) => setUntil(input.target.value)}
              />
            </label>
            <Button type="submit" disabled={pending}>
              {t('open')}
            </Button>
            {entry.from && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  void act(() =>
                    call(() =>
                      api.DELETE('/api/v1/admin/events/{eventId}/guest-entry', {
                        params: { path, query: { locale } },
                      }),
                    ),
                  )
                }
              >
                {t('close')}
              </Button>
            )}
          </form>
          <p role="status">
            {entry.open ? t('isOpen') : t('isClosed')} · {t('guests', { count: entry.guests })}
          </p>
          {entry.link && entry.open && (
            <div className="flex flex-col gap-2">
              <QrCode value={entry.link} label={t('qrLabel')} size={280} />
              <p className="text-sm break-all" dir="ltr">
                {entry.link}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">{t('staffTitle')}</h3>
        <p className="text-sm text-text-muted">{t('staffExplain')}</p>
        {sessions.map((session) => (
          <SessionStaff
            key={session.id}
            eventId={event.id}
            sessionId={session.id}
            title={session.translations[locale]?.title ?? session.translations.he?.title ?? ''}
          />
        ))}
      </div>
    </section>
  );
}

function SessionStaff({
  eventId,
  sessionId,
  title,
}: {
  eventId: string;
  sessionId: string;
  title: string;
}) {
  const t = useTranslations('events.admin.conference');
  const all = useTranslations();
  const { api, call } = useAuth();
  const [chairs, setChairs] = useState('');
  const [moderators, setModerators] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const path = { eventId, sessionId };

  useEffect(() => {
    call(() =>
      api.GET('/api/v1/admin/events/{eventId}/sessions/{sessionId}/staff', {
        params: { path: { eventId, sessionId } },
      }),
    )
      .then((result) => {
        setChairs(result.chairs.map((person) => person.email).join(', '));
        setModerators(result.moderators.map((person) => person.email).join(', '));
      })
      .catch((caught: unknown) => setError(caught));
  }, [api, call, eventId, sessionId]);

  const emails = (text: string) =>
    text
      .split(/[\s,;]+/)
      .map((email) => email.trim())
      .filter(Boolean);

  async function save(submit: FormEvent) {
    submit.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await call(() =>
        api.PUT('/api/v1/admin/events/{eventId}/sessions/{sessionId}/staff', {
          params: { path },
          body: { chairs: emails(chairs), moderators: emails(moderators) },
        }),
      );
      setSaved(true);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-border p-3"
      onSubmit={(submit) => void save(submit)}
    >
      <p className="font-semibold">{title}</p>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      <label className="flex flex-col gap-1">
        <span>{t('chairs')}</span>
        <input
          className={field}
          dir="ltr"
          value={chairs}
          onChange={(input) => setChairs(input.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t('moderators')}</span>
        <input
          className={field}
          dir="ltr"
          value={moderators}
          onChange={(input) => setModerators(input.target.value)}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary">
          {t('saveStaff')}
        </Button>
        {saved && <span role="status">{t('saved')}</span>}
      </div>
    </form>
  );
}
