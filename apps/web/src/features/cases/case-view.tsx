'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { StoredImage } from '@/features/content/files';
import { useLocalName } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import {
  AuthorLine,
  type Case,
  CasesFrame,
  CasesNav,
  StandingNote,
  link,
  usePatientLine,
} from './cases-parts';

type Poll = NonNullable<Case['poll']>;
type History = components['schemas']['CaseHistoryDto']['items'];
type Action = 'APPROVE' | 'RETURN' | 'RESTORE' | 'REMOVE' | 'TAKE_BACK' | 'WEEK';

const ACTIONS: Partial<Record<Case['status'], Action[]>> = {
  IN_REVIEW: ['APPROVE', 'RETURN'],
  PUBLISHED: ['WEEK', 'TAKE_BACK', 'REMOVE'],
  HIDDEN: ['RESTORE', 'REMOVE'],
};
const NEEDS_NOTE: Action[] = ['RETURN', 'TAKE_BACK', 'REMOVE'];

/** One case (M26): what it is, its pictures, the poll, the discussion; review for reviewers. */
export function CaseView({ id }: { id: string }) {
  return (
    <CasesFrame>
      <View id={id} />
    </CasesFrame>
  );
}

function View({ id }: { id: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const patient = usePatientLine();
  const router = useRouter();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Case | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/cases/{id}', { params: { path: { id } } }))
      .then(async (result) => {
        if (!active) return;
        setItem(result);
        if (result.mine || result.canReview) {
          const steps = await call(() =>
            api.GET('/api/v1/cases/{id}/history', { params: { path: { id } } }),
          );
          if (active) setHistory(steps.items);
        }
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const params = { params: { path: { id } } };
  const refreshHistory = async () => {
    const steps = await call(() => api.GET('/api/v1/cases/{id}/history', params));
    setHistory(steps.items);
  };
  const submit = () =>
    void run(async () => {
      setItem(await call(() => api.POST('/api/v1/cases/{id}/submit', params)));
      await refreshHistory();
    });
  const remove = () =>
    void run(async () => {
      await call(() => api.DELETE('/api/v1/cases/{id}', params));
      router.push('/cases/mine');
    });
  const report = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await call(() =>
        api.POST('/api/v1/cases/{id}/report', { ...params, body: { reason: reason.trim() } }),
      );
      setReporting(false);
      setReported(true);
    });
  };
  const review = (action: Action) =>
    void run(async () => {
      setItem(
        await call(() =>
          api.POST('/api/v1/cases/{id}/review', {
            ...params,
            body: { action, ...(note.trim() ? { note: note.trim() } : {}) },
          }),
        ),
      );
      setNote('');
      await refreshHistory();
    });

  const c = (key: string, values?: Record<string, string | number>) =>
    t(`cases.case.${key}`, values);
  const back = (
    <Link href="/cases" className={link}>
      {c('back')}
    </Link>
  );
  if (reported) {
    return (
      <PageFrame>
        {back}
        <Alert tone="success">{c('reported')}</Alert>
      </PageFrame>
    );
  }
  if (error !== null && !item) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? c('notFound') : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!item) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }

  const sections: [string, string | null][] = [
    ['history', item.history],
    ['examination', item.examination],
    ['labs', item.labs],
    ['imaging', item.imaging],
    ['pathology', item.pathology],
    ['management', item.management],
  ];
  const actions = (item.canReview ? (ACTIONS[item.status] ?? []) : []).filter(
    (action) => !(item.mine && (action === 'APPROVE' || action === 'RESTORE')),
  );
  return (
    <PageFrame>
      <CasesNav reviewer={item.canReview} />
      {back}
      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">
            {name(item.subspecialty)}
            {item.status !== 'PUBLISHED' && ` · ${t(`cases.statuses.${item.status}`)}`}
            {item.week && ` · ${c('weekMark')}`}
          </p>
          <h1 className="text-3xl font-semibold text-brand-900" dir="auto">
            {item.title}
          </h1>
          <p className="text-text-muted">
            <AuthorLine author={item.author} />
          </p>
        </header>
        <StandingNote />
        {item.status === 'IN_REVIEW' && item.mine && <Alert>{c('waitingNote')}</Alert>}
        {item.reviewNote && item.status === 'RETURNED' && (
          <Alert tone="warning">{c('returnedNote', { note: item.reviewNote })}</Alert>
        )}
        {item.reviewNote && item.status === 'REMOVED' && (
          <Alert tone="warning">{c('removedNote', { note: item.reviewNote })}</Alert>
        )}
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">{c('patient')}</dt>
          <dd>{patient(item)}</dd>
        </dl>
        {sections.map(([key, text]) =>
          text ? (
            <section key={key} aria-labelledby={`case-${key}`} className="flex flex-col gap-1">
              <h2 id={`case-${key}`} className="text-xl font-semibold">
                {c(key)}
              </h2>
              <p className="whitespace-pre-line" dir="auto">
                {text}
              </p>
            </section>
          ) : null,
        )}
        {item.fileIds.length > 0 && (
          <section aria-labelledby="case-pictures" className="flex flex-col gap-2">
            <h2 id="case-pictures" className="text-xl font-semibold">
              {c('pictures')}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {item.fileIds.map((fileId, index) => (
                <li key={fileId}>
                  <StoredImage
                    fileId={fileId}
                    alt={c('pictureAlt', { number: index + 1 })}
                    className="w-full rounded-md border border-border"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          aria-labelledby="case-question"
          className="flex flex-col gap-1 rounded-md border border-primary p-5"
        >
          <h2 id="case-question" className="text-xl font-semibold">
            {c('question')}
          </h2>
          <p className="whitespace-pre-line" dir="auto">
            {item.question}
          </p>
        </section>
        {item.poll && (
          <PollSection
            id={item.id}
            poll={item.poll}
            onChange={(poll) => setItem({ ...item, poll })}
          />
        )}
        <section aria-labelledby="case-discussion" className="flex flex-col gap-2">
          <h2 id="case-discussion" className="text-xl font-semibold">
            {c('discussion')}
          </h2>
          {item.discussion ? (
            <Link
              href={`/communities/${item.discussion.communitySlug}/${item.discussion.postId}`}
              className={link}
            >
              {c('openDiscussion')}
            </Link>
          ) : (
            <p className="text-text-muted">{c('noDiscussion')}</p>
          )}
        </section>
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {item.mine && (item.canEdit || item.status !== 'REMOVED') && (
          <div className="flex flex-wrap items-center gap-3">
            {item.canEdit && (
              <>
                <Link href={`/cases/${item.id}/edit`} className={link}>
                  {c('edit')}
                </Link>
                <Button type="button" pending={pending} onClick={submit}>
                  {c('submit')}
                </Button>
              </>
            )}
            {!deleting ? (
              <Button type="button" variant="secondary" onClick={() => setDeleting(true)}>
                {c('delete')}
              </Button>
            ) : (
              <div
                role="group"
                aria-label={c('delete')}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4"
              >
                <p>{c('deleteConfirm')}</p>
                <Button type="button" variant="danger" pending={pending} onClick={remove}>
                  {c('delete')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDeleting(false)}>
                  {c('cancel')}
                </Button>
              </div>
            )}
          </div>
        )}
        {!item.mine && item.status === 'PUBLISHED' && !reporting && (
          <div>
            <Button type="button" variant="secondary" onClick={() => setReporting(true)}>
              {c('report')}
            </Button>
          </div>
        )}
        {reporting && (
          <form
            onSubmit={report}
            className="flex flex-col gap-3 rounded-md border border-border p-5"
          >
            <TextareaField
              label={c('reportReason')}
              hint={c('reportHint')}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" pending={pending} disabled={!reason.trim()}>
                {c('sendReport')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setReporting(false)}>
                {c('cancel')}
              </Button>
            </div>
          </form>
        )}
        {item.canReview && (actions.length > 0 || item.reports.length > 0) && (
          <ReviewPanel
            item={item}
            actions={actions}
            note={note}
            onNote={setNote}
            pending={pending}
            onAction={review}
          />
        )}
        {history.length > 0 && <HistoryList history={history} />}
      </article>
    </PageFrame>
  );
}

function ReviewPanel({
  item,
  actions,
  note,
  onNote,
  pending,
  onAction,
}: {
  item: Case;
  actions: Action[];
  note: string;
  onNote: (note: string) => void;
  pending: boolean;
  onAction: (action: Action) => void;
}) {
  const t = useTranslations('cases.review');
  const format = useFormatter();
  return (
    <section
      aria-labelledby="case-review"
      className="flex flex-col gap-3 rounded-md border border-border p-5"
    >
      <h2 id="case-review" className="text-xl font-semibold">
        {t('title')}
      </h2>
      {item.mine && <Alert>{t('ownCase')}</Alert>}
      {item.reports.length > 0 && (
        <>
          <h3 className="font-semibold">{t('reportsTitle')}</h3>
          <ul className="list-disc ps-6" data-testid="case-reports">
            {item.reports.map((report, index) => (
              <li key={index}>
                {format.dateTime(new Date(report.createdAt), { dateStyle: 'medium' })}:{' '}
                <span dir="auto">{report.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {actions.some((action) => NEEDS_NOTE.includes(action)) && (
        <TextareaField
          label={t('note')}
          hint={t('noteHint')}
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => onNote(event.target.value)}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action}
            type="button"
            variant={action === 'APPROVE' || action === 'RESTORE' ? 'primary' : 'secondary'}
            disabled={pending || (NEEDS_NOTE.includes(action) && !note.trim())}
            onClick={() => onAction(action)}
          >
            {t(`actions.${action}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function HistoryList({ history }: { history: History }) {
  const t = useTranslations('cases');
  const format = useFormatter();
  return (
    <section aria-labelledby="case-history" className="flex flex-col gap-2">
      <h2 id="case-history" className="text-lg font-semibold">
        {t('case.history')}
      </h2>
      <ol className="flex flex-col gap-1 text-sm" data-testid="case-history">
        {history.map((step, index) => (
          <li key={index}>
            {format.dateTime(new Date(step.at), { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
            {t(`statuses.${step.toStatus}`)}
            {step.actor && ` · ${step.actor.firstName} ${step.actor.lastName}`}
            {step.note && ` · ${step.note}`}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "What would you do?": anonymous, totals after answering or once closed. */
function PollSection({
  id,
  poll,
  onChange,
}: {
  id: string;
  poll: Poll;
  onChange: (poll: Poll) => void;
}) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function vote(optionId: string) {
    setPending(true);
    setError(null);
    try {
      onChange(
        await call(() =>
          api.PUT('/api/v1/cases/{id}/vote', { params: { path: { id } }, body: { optionId } }),
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const c = (key: string, values?: Record<string, string | number>) =>
    t(`cases.case.${key}`, values);
  const mine = poll.options.find((option) => option.id === poll.mine);
  return (
    <section
      aria-labelledby="case-poll"
      className="flex flex-col gap-3 rounded-md border border-border p-5"
    >
      <h2 id="case-poll" className="text-xl font-semibold">
        {c('poll')}
      </h2>
      <p className="text-sm text-text-muted">{c('pollNote')}</p>
      {poll.open ? (
        <div className="flex flex-wrap gap-3" role="group" aria-label={c('poll')}>
          {poll.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={pending}
              aria-pressed={poll.mine === option.id}
              onClick={() => void vote(option.id)}
              dir="auto"
              className={`rounded-md border px-4 py-2 font-semibold disabled:opacity-60 ${
                poll.mine === option.id
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border text-text hover:bg-surface-muted'
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>
      ) : (
        <p>{c('pollClosed')}</p>
      )}
      {mine && <p role="status">{c('yourAnswer', { answer: mine.text })}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {poll.totals && (
        <div className="flex flex-col gap-2" data-testid="case-poll-totals">
          <p className="text-sm text-text-muted">{c('totals', { count: poll.total })}</p>
          {poll.options.map((option) => {
            const count = poll.totals?.[option.id] ?? 0;
            const percent = poll.total ? Math.round((count / poll.total) * 100) : 0;
            return (
              <div key={option.id} className="flex items-center gap-3">
                <span className="w-48 shrink-0 text-sm" dir="auto">
                  {c('share', { answer: option.text, percent })}
                </span>
                <span
                  aria-hidden="true"
                  className="h-3 rounded-full bg-primary"
                  style={{ width: `${Math.max(percent, 1)}%`, maxWidth: '50%' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
