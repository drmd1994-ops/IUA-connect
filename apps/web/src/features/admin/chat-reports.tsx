'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type List = Schemas['AdminReportListDto'];
type Report = Schemas['AdminReportDto'];
type Suspensions = Schemas['AdminSuspensionListDto'];
type Status = Report['status'];
type ReportPerson = Report['reporter'];
type Decision = 'dismiss' | 'deleteMessage' | 'suspend' | 'archiveRoom';

const STATUSES: Status[] = ['OPEN', 'DISMISSED', 'UPHELD'];
const link = 'font-semibold text-primary underline underline-offset-4';

function usePersonName() {
  const t = useTranslations('chat.admin');
  return (person: ReportPerson) =>
    [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || t('unknownPerson');
}

function useRoomName() {
  const locale = useLocale();
  return (room: NonNullable<Report['room']>) =>
    locale === 'he' ? room.nameHe : (room.nameEn ?? room.nameHe);
}

/**
 * Chat reports, open ones first, and the people suspended from chat. Staff decide on reports
 * here; there is no screen for reading conversations.
 */
export function ChatReportsPage() {
  const all = useTranslations();
  const t = useTranslations('chat.admin');
  const locale = useLocale();
  const format = useFormatter();
  const name = usePersonName();
  const roomName = useRoomName();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<Status | ''>('OPEN');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/chat/reports', {
        params: { query: { page, ...(status ? { status } : {}) } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status]);

  // A report about a room as such names the room; nobody is reported.
  const subject = (item: List['items'][number]) =>
    item.aboutRoom && item.room ? roomName(item.room) : name(item.reported);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-2 text-text-muted">{t('intro')}</p>
      </div>
      <SelectField
        label={t('status')}
        placeholder={t('all')}
        className="max-w-sm"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as Status | '');
          setPage(1);
        }}
        options={STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!list && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {t('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{t('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="chat-reports-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      [
                        'colReported',
                        'colAbout',
                        'colCategory',
                        'colReporter',
                        'colStatus',
                        'colCreated',
                      ] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {t(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link
                          href={`/admin/chat/reports/${item.id}`}
                          className={link}
                          aria-label={`${t('open')}: ${subject(item)}`}
                        >
                          {subject(item)}
                        </Link>
                      </td>
                      <td className="p-3">
                        {item.aboutRoom
                          ? t('aboutRoom')
                          : item.aboutMessage
                            ? t('aboutMessage')
                            : t('aboutPerson')}
                        {item.room && !item.aboutRoom && (
                          <span className="block text-text-muted">
                            {t('inRoom', { name: roomName(item.room) })}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {locale === 'he' ? item.category.nameHe : item.category.nameEn}
                      </td>
                      <td className="p-3">{name(item.reporter)}</td>
                      <td className="p-3">
                        {t(`statuses.${item.status}`)}
                        {item.status === 'UPHELD' && (
                          <span className="block text-text-muted">
                            {t(`actions.${item.action}`)}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {format.dateTime(new Date(item.createdAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        </>
      )}
      <SuspensionList />
    </div>
  );
}

/** The people suspended from sending in chat, newest first, with a way to lift a suspension. */
function SuspensionList() {
  const all = useTranslations();
  const t = useTranslations('chat.admin.suspensions');
  const format = useFormatter();
  const name = usePersonName();
  const { api, call } = useAuth();
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Suspensions | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/chat/suspensions', { params: { query: { page } } }))
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, version]);

  async function lift(event: FormEvent) {
    event.preventDefault();
    if (!lifting) return;
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/admin/chat/suspensions/{id}/lift', {
          params: { path: { id: lifting } },
          body: { reason },
        }),
      );
      setLifting(null);
      setReason('');
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught);
    }
  }

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  return (
    <section aria-labelledby="chat-suspensions" className="flex flex-col gap-3">
      <h2 id="chat-suspensions" className="text-2xl font-semibold text-brand-900">
        {t('title')}
      </h2>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {list?.items.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
      {list && list.items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="chat-suspensions-table">
            <thead className="bg-surface-muted">
              <tr>
                {(['colPerson', 'colReason', 'colState'] as const).map((column) => (
                  <th key={column} scope="col" className="p-3 text-start">
                    {t(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.items.map((item) => (
                <tr key={item.id}>
                  <td className="p-3">{name(item.user)}</td>
                  <td className="p-3">{item.reason}</td>
                  <td className="p-3">
                    {item.liftedAt
                      ? t('lifted', { when: date(item.liftedAt) })
                      : !item.active && item.endsAt
                        ? t('ended', { when: date(item.endsAt) })
                        : item.endsAt
                          ? t('active', { when: date(item.endsAt) })
                          : t('activeOpen')}
                    {item.active && lifting !== item.id && (
                      <Button
                        type="button"
                        variant="link"
                        className="ms-3"
                        aria-label={t('liftName', { name: name(item.user) })}
                        onClick={() => setLifting(item.id)}
                      >
                        {t('lift')}
                      </Button>
                    )}
                    {lifting === item.id && (
                      <form onSubmit={lift} className="mt-2 flex flex-wrap items-end gap-3">
                        <TextField
                          label={t('liftReason')}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          minLength={3}
                          maxLength={1000}
                          required
                        />
                        <Button type="submit" disabled={reason.trim().length < 3}>
                          {t('lift')}
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
    </section>
  );
}

/** One report: who, why, the kept messages, and the decision. */
export function ChatReportPage({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('chat.admin');
  const d = useTranslations('chat.admin.detail');
  const locale = useLocale();
  const format = useFormatter();
  const name = usePersonName();
  const roomName = useRoomName();
  const m = useTranslations('rooms.room');
  const { api, call, me } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [decision, setDecision] = useState<Decision>('dismiss');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/chat/reports/{id}', { params: { path: { id } } }))
      .then((result) => active && setReport(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  async function decide(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      setReport(
        await call(() =>
          api.POST('/api/v1/admin/chat/reports/{id}/resolve', {
            params: { path: { id } },
            body: {
              decision,
              reason: reason.trim(),
              ...(decision === 'suspend' ? { days: days.trim() ? Number(days) : null } : {}),
            },
          }),
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const who = (senderId: string | null) =>
    senderId === report?.reported.id
      ? name(report.reported)
      : senderId === report?.reporter.id
        ? name(report.reporter)
        : // In a room the messages around the reported one may be anybody's.
          report?.room && senderId
          ? m('unknownPerson')
          : t('unknownPerson');
  const daysValid =
    days.trim() === '' || (/^\d{1,3}$/.test(days.trim()) && +days >= 1 && +days <= 365);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/chat/reports" className={link}>
        {t('back')}
      </Link>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!report && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {report && (
        <>
          <div>
            <h1 className="text-3xl font-semibold text-brand-900">{d('title')}</h1>
            <p className="mt-2 text-sm text-text-muted">{d('viewNote')}</p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]" data-testid="chat-report">
            {(
              [
                [t('colStatus'), t(`statuses.${report.status}`)],
                [
                  t('colCategory'),
                  locale === 'he' ? report.category.nameHe : report.category.nameEn,
                ],
                [t('colCreated'), when(report.createdAt)],
              ] as const
            ).map(([term, value]) => (
              <div key={term} className="contents">
                <dt className="font-semibold">{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {report.room && (
              <div className="contents">
                <dt className="font-semibold">{d('room')}</dt>
                <dd>
                  {roomName(report.room)}
                  {' · '}
                  <Link href={`/chat/rooms/${report.room.id}`} className={link}>
                    {d('openRoom')}
                  </Link>
                </dd>
              </div>
            )}
            {[
              ...(report.aboutRoom ? [] : [[t('colReported'), report.reported] as const]),
              [t('colReporter'), report.reporter] as const,
            ].map(([term, person]) => (
              <div key={term} className="contents">
                <dt className="font-semibold">{term}</dt>
                <dd>
                  {name(person)}
                  {person.id && (
                    <>
                      {' · '}
                      <Link href={`/admin/users/${person.id}`} className={link}>
                        {d('account')}
                      </Link>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {report.reportedSuspended && <Alert tone="warning">{d('suspendedNow')}</Alert>}

          <section aria-labelledby="report-description">
            <h2 id="report-description" className="text-xl font-semibold">
              {d('description')}
            </h2>
            <p dir="auto" className="mt-2 whitespace-pre-line">
              {report.description ?? d('noDescription')}
            </p>
          </section>

          <section aria-labelledby="report-messages" className="flex flex-col gap-3">
            <h2 id="report-messages" className="text-xl font-semibold">
              {d('messages')}
            </h2>
            {report.messages.length === 0 ? (
              <p className="text-text-muted">
                {report.aboutRoom
                  ? d('aboutRoom')
                  : report.aboutMessage
                    ? d('erased')
                    : d('noMessages')}
              </p>
            ) : (
              <ol data-testid="report-messages" className="flex flex-col gap-2">
                {report.messages.map((message) => (
                  <li
                    key={message.seq}
                    data-reported={message.reported}
                    className={`rounded-md border p-3 ${
                      message.reported
                        ? 'border-danger-700 bg-danger-100'
                        : 'border-border bg-surface'
                    }`}
                  >
                    <p className="text-xs text-text-muted">
                      {message.reported && (
                        <span className="font-semibold text-danger-700">
                          {d('reportedMessage')}
                          {' · '}
                        </span>
                      )}
                      {who(message.senderId)}
                      {' · '}
                      {when(message.createdAt)}
                    </p>
                    <p dir="auto" className="mt-1 whitespace-pre-wrap break-words">
                      {message.deleted ? d('deletedMessage') : message.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {report.status !== 'OPEN' && (
            <Alert tone="info">
              {t(`statuses.${report.status}`)}
              {report.status === 'UPHELD' && ` · ${t(`actions.${report.action}`)}`}
              {'. '}
              {d('closed', {
                name: name(report.reviewer),
                when: report.reviewedAt ? when(report.reviewedAt) : '',
                reason: report.resolution ?? '',
              })}
            </Alert>
          )}
          {report.status === 'OPEN' && !report.canResolve && <Alert>{d('own')}</Alert>}
          {report.canResolve && (
            <form onSubmit={decide} noValidate className="flex max-w-xl flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xl font-semibold">{d('decision')}</legend>
                {(
                  [
                    ['dismiss', true],
                    ['deleteMessage', report.aboutMessage && report.messages.length > 0],
                    ['suspend', report.reported.id !== null],
                    [
                      'archiveRoom',
                      report.room !== null &&
                        (me?.permissions.includes('chat.rooms.manage') ?? false),
                    ],
                  ] as const
                )
                  .filter(([, possible]) => possible)
                  .map(([value]) => (
                    <label key={value} className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="decision"
                        className="mt-1 size-5"
                        checked={decision === value}
                        onChange={() => setDecision(value)}
                      />
                      <span>
                        {value === 'deleteMessage' && report.room
                          ? d('deleteRoomMessage')
                          : d(value)}
                      </span>
                    </label>
                  ))}
              </fieldset>
              {decision === 'suspend' && (
                <TextField
                  label={d('days')}
                  hint={d('daysHint')}
                  inputMode="numeric"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  maxLength={3}
                  className="max-w-xs"
                />
              )}
              <TextareaField
                label={d('reason')}
                hint={d('reasonHint')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                rows={3}
              />
              <div>
                <Button
                  type="submit"
                  pending={pending}
                  disabled={reason.trim().length < 3 || (decision === 'suspend' && !daysValid)}
                >
                  {d('submit')}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
