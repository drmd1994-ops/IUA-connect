'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { downloadFile, useEventTime } from '@/features/events/shared';
import { QrCode } from '@/features/membership/qr-code';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type Event = Schemas['AdminEventDto'];
type Registrations = Schemas['AdminRegistrationListDto'];
type Attendance = Schemas['AttendanceListDto'];
type Session = Schemas['AdminSessionDto'];

const ZONE = 'Asia/Jerusalem';
const PAGE_SIZE = 50;
/** Codes live 5 minutes; fetch a new one well before that. */
const CODE_REFRESH_MS = 4 * 60 * 1000;
const cell = 'p-3 text-start';

/** Who registered, and who is waiting. `version` reloads the list when the event changes. */
export function EventRegistrations({ eventId, version }: { eventId: string; version: number }) {
  const t = useTranslations();
  const r = (key: string, values?: Record<string, string | number>) =>
    t(`events.admin.registrations.${key}`, values);
  const { dateTime } = useEventTime();
  const { api, call } = useAuth();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Registrations | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/events/{eventId}/registrations', {
        params: { path: { eventId }, query: { page, pageSize: PAGE_SIZE } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, eventId, page, version]);

  return (
    <section aria-labelledby="registrations-title" className="flex flex-col gap-4">
      <h2 id="registrations-title" className="text-xl font-semibold">
        {r('title')}
      </h2>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {list && (
        <>
          <p className="text-text-muted" data-testid="registration-summary">
            {r('summary', { registered: list.registered, waiting: list.waiting })}
            {' · '}
            {list.capacity === null ? r('unlimited') : r('capacity', { capacity: list.capacity })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{r('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="registrations-table">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className={cell}>
                      {r('name')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('email')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('status')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('since')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">{item.name ?? t('membership.common.none')}</td>
                      <td className="p-3" dir="ltr">
                        {item.email}
                      </td>
                      <td className="p-3">{r(`statuses.${item.status}`)}</td>
                      <td className="p-3">{dateTime(item.queuedAt, ZONE)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}

/** The check-in code for the venue, marking by hand, the attendance list and its CSV. */
export function EventAttendance({ event }: { event: Event }) {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`events.admin.attendance.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const { dateTime } = useEventTime();
  const { api, call } = useAuth();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Attendance | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [email, setEmail] = useState('');
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const eventId = event.id;

  useEffect(() => {
    let active = true;
    Promise.all([
      call(() =>
        api.GET('/api/v1/admin/events/{eventId}/attendance', {
          params: { path: { eventId }, query: { page, pageSize: PAGE_SIZE } },
        }),
      ),
      call(() =>
        api.GET('/api/v1/admin/events/{eventId}/sessions', { params: { path: { eventId } } }),
      ),
    ])
      .then(([records, programme]) => {
        if (!active) return;
        setList(records);
        setSessions(programme.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, eventId, page, version]);

  const sessionTitle = (id: string | null) => {
    if (!id) return a('wholeEvent');
    const session = sessions.find((s) => s.id === id);
    return (
      (locale === 'he'
        ? (session?.translations.he?.title ?? session?.translations.en?.title)
        : (session?.translations.en?.title ?? session?.translations.he?.title)) ?? ''
    );
  };

  async function attempt(request: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await request();
      setVersion((v) => v + 1);
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function mark(formEvent: FormEvent) {
    formEvent.preventDefault();
    const ok = await attempt(() =>
      call(() =>
        api.POST('/api/v1/admin/events/{eventId}/attendance', {
          params: { path: { eventId } },
          body: { email: email.trim() },
        }),
      ),
    );
    if (ok) setEmail('');
  }

  async function confirmVoid(attendanceId: string) {
    const ok = await attempt(() =>
      call(() =>
        api.POST('/api/v1/admin/events/{eventId}/attendance/{attendanceId}/void', {
          params: { path: { eventId, attendanceId } },
          body: { reason: reason.trim() },
        }),
      ),
    );
    if (ok) {
      setVoiding(null);
      setReason('');
    }
  }

  return (
    <section aria-labelledby="attendance-title" className="flex flex-col gap-4">
      <h2 id="attendance-title" className="text-xl font-semibold">
        {a('title')}
      </h2>
      {event.status === 'DRAFT' ? (
        <p className="text-text-muted">{a('notPublished')}</p>
      ) : (
        <>
          {event.status === 'PUBLISHED' && <CheckInCode eventId={eventId} sessions={sessions} />}
          {event.status === 'PUBLISHED' && (
            <form
              onSubmit={mark}
              noValidate
              aria-labelledby="manual-title"
              className="flex flex-wrap items-end gap-3"
            >
              <h3 id="manual-title" className="w-full text-lg font-semibold">
                {a('manualTitle')}
              </h3>
              <TextField
                type="email"
                label={a('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-w-64 flex-1"
              />
              <Button type="submit" variant="secondary" pending={pending} disabled={!email.trim()}>
                {a('mark')}
              </Button>
            </form>
          )}
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {list && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-text-muted" data-testid="attendance-summary">
                  {a('summary', { count: list.attendees })}
                </p>
                <Button
                  type="button"
                  variant="link"
                  onClick={() =>
                    void downloadFile(
                      `/api/v1/admin/events/${eventId}/attendance.csv`,
                      'attendance.csv',
                    ).catch((caught: unknown) => setError(caught))
                  }
                >
                  {a('downloadCsv')}
                </Button>
              </div>
              {list.items.length === 0 ? (
                <p className="text-text-muted">{a('empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="attendance-list">
                  {list.items.map((item) => {
                    const who = item.name ?? item.email;
                    return (
                      <li key={item.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className={`font-semibold ${item.voidedAt ? 'line-through' : ''}`}>
                              {who}
                              <span className="font-normal text-text-muted" dir="ltr">
                                {item.name ? ` · ${item.email}` : ''}
                              </span>
                            </p>
                            <p className="text-text-muted">
                              {sessionTitle(item.sessionId)}
                              {' · '}
                              {a(`methods.${item.method}`)}
                              {' · '}
                              {dateTime(item.at, ZONE)}
                            </p>
                            {item.voidedAt && (
                              <p className="text-danger-700">
                                {a('voided', { reason: item.voidReason ?? '' })}
                              </p>
                            )}
                          </div>
                          {!item.voidedAt && voiding !== item.id && (
                            <Button
                              type="button"
                              variant="link"
                              aria-label={a('voidItem', { name: who })}
                              onClick={() => {
                                setVoiding(item.id);
                                setReason('');
                              }}
                            >
                              {a('void')}
                            </Button>
                          )}
                        </div>
                        {voiding === item.id && (
                          <div className="mt-3 flex flex-wrap items-end gap-3">
                            <TextField
                              label={a('voidReason')}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              maxLength={500}
                              className="min-w-64 flex-1"
                            />
                            <Button
                              type="button"
                              variant="danger"
                              disabled={pending || !reason.trim()}
                              onClick={() => void confirmVoid(item.id)}
                            >
                              {a('voidConfirm')}
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
            </>
          )}
        </>
      )}
    </section>
  );
}

/** The QR code to show at the venue. It asks for a fresh code before the old one expires. */
function CheckInCode({ eventId, sessions }: { eventId: string; sessions: Session[] }) {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`events.admin.attendance.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const { api, call } = useAuth();
  const [shown, setShown] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [code, setCode] = useState<{ key: string; url: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${eventId}:${sessionId}:${locale}`;

  useEffect(() => {
    if (!shown) return;
    let active = true;
    const load = () =>
      call(() =>
        api.GET('/api/v1/admin/events/{eventId}/attendance/code', {
          params: {
            path: { eventId },
            query: { locale, ...(sessionId ? { sessionId } : {}) },
          },
        }),
      )
        .then((result) => active && setCode({ key, url: result.url }))
        .catch((caught: unknown) => active && setError(caught));
    void load();
    const timer = setInterval(() => void load(), CODE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, call, shown, eventId, sessionId, locale, key]);

  const title = (session: Session) =>
    (locale === 'he'
      ? (session.translations.he?.title ?? session.translations.en?.title)
      : (session.translations.en?.title ?? session.translations.he?.title)) ?? '';
  const target = sessionId
    ? title(sessions.find((s) => s.id === sessionId) ?? sessions[0]!)
    : a('wholeEvent');

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={shown}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? a('hideCode') : a('showCode')}
        </Button>
      </div>
      {shown && (
        <>
          <SelectField
            label={a('codeFor')}
            className="max-w-md"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            options={[
              { value: '', label: a('wholeEvent') },
              ...sessions.map((session) => ({ value: session.id, label: title(session) })),
            ]}
          />
          <p className="text-sm text-text-muted">{a('codeHint')}</p>
          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {code?.key === key ? (
            <div data-testid="check-in-code" data-url={code.url}>
              <QrCode value={code.url} label={a('codeLabel', { target })} size={280} />
            </div>
          ) : (
            error === null && <p role="status">{t('membership.common.loading')}</p>
          )}
        </>
      )}
    </div>
  );
}
