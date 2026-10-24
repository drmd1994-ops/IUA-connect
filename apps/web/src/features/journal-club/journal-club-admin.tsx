'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';

type Schemas = components['schemas'];
type List = Schemas['JournalClubAdminListDto'];
type Entry = Schemas['JournalClubAdminEntryDto'];
type Input = Schemas['JournalClubInputDto'];
type Status = Entry['status'];
type Action = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_BACK' | 'ARCHIVE';
type History = Schemas['JournalClubHistoryDto']['items'];

const STATUSES: Status[] = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'];
const ACTIONS: Record<Status, Action[]> = {
  DRAFT: ['SUBMIT'],
  IN_REVIEW: ['PUBLISH', 'SEND_BACK'],
  PUBLISHED: ['TAKE_BACK', 'ARCHIVE'],
  ARCHIVED: [],
};
const link = 'font-semibold text-primary underline underline-offset-4';

/** The entries the reader may work on (M31): every subspecialty, or their own. */
export function JournalClubAdminList() {
  const t = useTranslations();
  const name = useLocalName();
  const format = useFormatter();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<Status | ''>('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/journal-club', {
        params: { query: { page, ...(status ? { status } : {}) } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status]);

  const a = (key: string) => t(`journalClub.admin.${key}`);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
          <p className="mt-2 text-text-muted">{a('intro')}</p>
        </div>
        <Link
          href="/admin/journal-club/new"
          className="rounded-md bg-primary px-4 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
        >
          {a('new')}
        </Link>
      </div>
      <SelectField
        className="max-w-xs"
        label={a('status')}
        placeholder={a('allStatuses')}
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as Status | '');
          setPage(1);
        }}
        options={STATUSES.map((value) => ({ value, label: a(`statuses.${value}`) }))}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{a('empty')}</p>}
      {list && list.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-start" data-testid="admin-journal-club">
            <thead>
              <tr className="border-b border-border text-sm text-text-muted">
                <th scope="col" className="p-2 text-start">
                  {a('articleTitle')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('subspecialty')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('month')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="p-2">
                    <Link href={`/admin/journal-club/${item.id}`} className={link}>
                      {item.articleTitle}
                    </Link>
                  </td>
                  <td className="p-2">{name(item.subspecialty)}</td>
                  <td className="p-2">
                    {format.dateTime(new Date(`${item.month}-15T12:00:00Z`), {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="p-2">{a(`statuses.${item.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
    </div>
  );
}

/** The editable fields, as typed (key points one per line). */
interface Form {
  subspecialtyId: string;
  month: string;
  locale: 'he' | 'en';
  articleTitle: string;
  articleAuthors: string;
  journal: string;
  year: string;
  doi: string;
  pmid: string;
  summary: string;
  summaryAuthorEmail: string;
  commentary: string;
  commentaryAuthorEmail: string;
  keyPoints: string;
}

function emptyForm(): Form {
  return {
    subspecialtyId: '',
    month: new Date().toISOString().slice(0, 7),
    locale: 'he',
    articleTitle: '',
    articleAuthors: '',
    journal: '',
    year: '',
    doi: '',
    pmid: '',
    summary: '',
    summaryAuthorEmail: '',
    commentary: '',
    commentaryAuthorEmail: '',
    keyPoints: '',
  };
}

function formOf(entry: Entry): Form {
  return {
    subspecialtyId: entry.subspecialty.id,
    month: entry.month,
    locale: entry.locale,
    articleTitle: entry.articleTitle,
    articleAuthors: entry.articleAuthors,
    journal: entry.journal ?? '',
    year: entry.year ? String(entry.year) : '',
    doi: entry.doi ?? '',
    pmid: entry.pmid ?? '',
    summary: entry.summary,
    summaryAuthorEmail: entry.summaryAuthor?.email ?? '',
    commentary: entry.commentary ?? '',
    commentaryAuthorEmail: entry.commentaryAuthor?.email ?? '',
    keyPoints: entry.keyPoints.join('\n'),
  };
}

function toInput(form: Form): Input {
  const year = Number.parseInt(form.year, 10);
  const commentary = form.commentary.trim();
  return {
    subspecialtyId: form.subspecialtyId,
    month: form.month,
    locale: form.locale,
    articleTitle: form.articleTitle.trim(),
    articleAuthors: form.articleAuthors.trim(),
    journal: form.journal.trim() || null,
    year: Number.isFinite(year) ? year : null,
    doi: form.doi.trim() || null,
    pmid: form.pmid.trim() || null,
    summary: form.summary.trim(),
    summaryAuthorEmail: form.summaryAuthorEmail.trim(),
    commentary: commentary || null,
    commentaryAuthorEmail: commentary ? form.commentaryAuthorEmail.trim() || null : null,
    keyPoints: form.keyPoints
      .split('\n')
      .map((point) => point.trim())
      .filter(Boolean),
  };
}

/** Writes a new entry (`id` null), or works on one: change a draft, review, publish, close. */
export function JournalClubEditor({ id }: { id: string | null }) {
  const t = useTranslations();
  const format = useFormatter();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call } = useAuth();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [form, setForm] = useState<Form | null>(id ? null : emptyForm());
  const [scope, setScope] = useState<{ all: boolean; subspecialtyIds: string[] } | null>(null);
  const [history, setHistory] = useState<History>([]);
  const [lookupId, setLookupId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/journal-club/scope'))
      .then((result) => active && setScope(result))
      .catch((caught: unknown) => active && setError(caught));
    if (id) {
      const params = { params: { path: { id } } };
      Promise.all([
        call(() => api.GET('/api/v1/admin/journal-club/{id}', params)),
        call(() => api.GET('/api/v1/admin/journal-club/{id}/history', params)),
      ])
        .then(([loaded, steps]) => {
          if (!active) return;
          setEntry(loaded);
          setForm(formOf(loaded));
          setHistory(steps.items);
        })
        .catch((caught: unknown) => active && setError(caught));
    }
    return () => {
      active = false;
    };
  }, [api, call, id]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const set = (patch: Partial<Form>) => {
    setSaved(false);
    setForm((current) => current && { ...current, ...patch });
  };

  const refresh = async (entryId: string) => {
    const steps = await call(() =>
      api.GET('/api/v1/admin/journal-club/{id}/history', { params: { path: { id: entryId } } }),
    );
    setHistory(steps.items);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    void run(async () => {
      const body = toInput(form);
      if (id) {
        const updated = await call(() =>
          api.PUT('/api/v1/admin/journal-club/{id}', { params: { path: { id } }, body }),
        );
        setEntry(updated);
        setForm(formOf(updated));
        setSaved(true);
      } else {
        const created = await call(() => api.POST('/api/v1/admin/journal-club', { body }));
        router.replace(`/admin/journal-club/${created.id}`);
      }
    });
  };

  const fill = () =>
    void run(async () => {
      const value = lookupId.trim();
      const body = /^\d+$/.test(value) ? { pmid: value } : { doi: value };
      const article = await call(() => api.POST('/api/v1/admin/journal-club/lookup', { body }));
      set({
        articleTitle: article.articleTitle,
        articleAuthors: article.articleAuthors,
        journal: article.journal ?? '',
        year: article.year ? String(article.year) : '',
        doi: article.doi ?? '',
        pmid: article.pmid ?? '',
      });
    });

  const step = (action: Action) =>
    void run(async () => {
      if (!id) return;
      const next = await call(() =>
        api.POST('/api/v1/admin/journal-club/{id}/transition', {
          params: { path: { id } },
          body: { action, ...(comment.trim() ? { comment: comment.trim() } : {}) },
        }),
      );
      setEntry(next);
      setForm(formOf(next));
      setComment('');
      await refresh(id);
    });

  const a = (key: string) => t(`journalClub.admin.${key}`);
  const editable = !entry || entry.status === 'DRAFT';
  const subspecialties = (reference?.subspecialties ?? []).filter(
    (s) => !scope || scope.all || scope.subspecialtyIds.includes(s.id),
  );
  const field = (key: keyof Form) => ({
    value: form?.[key] ?? '',
    disabled: !editable,
    onChange: (event: { target: { value: string } }) => set({ [key]: event.target.value }),
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/journal-club" className={link}>
        {a('title')}
      </Link>
      <h1 className="text-3xl font-semibold text-brand-900">
        {id ? a('editTitle') : a('newTitle')}
      </h1>
      {entry && (
        <p className="text-text-muted" data-testid="journal-club-status">
          {a('status')}: {a(`statuses.${entry.status}`)}
        </p>
      )}
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') && id
            ? t('journalClub.entry.notFound')
            : errorMessage(error, t)}
        </Alert>
      )}
      {!form && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {form && (
        <form onSubmit={save} className="flex max-w-3xl flex-col gap-5" noValidate>
          {editable && (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
              <TextField
                className="min-w-56 flex-1"
                label={a('fillLabel')}
                hint={a('fillHint')}
                value={lookupId}
                maxLength={300}
                dir="ltr"
                onChange={(event) => setLookupId(event.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !lookupId.trim()}
                onClick={fill}
              >
                {a('fill')}
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label={a('subspecialty')}
              placeholder={a('chooseSubspecialty')}
              value={form.subspecialtyId}
              disabled={!editable}
              onChange={(event) => set({ subspecialtyId: event.target.value })}
              options={subspecialties.map((s) => ({ value: s.id, label: name(s) }))}
            />
            <TextField label={a('month')} type="month" {...field('month')} />
            <SelectField
              label={a('locale')}
              value={form.locale}
              disabled={!editable}
              onChange={(event) => set({ locale: event.target.value as 'he' | 'en' })}
              options={(['he', 'en'] as const).map((value) => ({
                value,
                label: a(`locales.${value}`),
              }))}
            />
          </div>
          <TextField
            label={a('articleTitle')}
            maxLength={500}
            required
            {...field('articleTitle')}
          />
          <TextField label={a('articleAuthors')} maxLength={2000} {...field('articleAuthors')} />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <TextField label={a('journal')} maxLength={300} {...field('journal')} />
            <TextField label={a('year')} inputMode="numeric" maxLength={4} {...field('year')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={a('doi')} maxLength={200} dir="ltr" {...field('doi')} />
            <TextField
              label={a('pmid')}
              inputMode="numeric"
              maxLength={9}
              dir="ltr"
              {...field('pmid')}
            />
          </div>
          <TextareaField
            label={a('summary')}
            hint={a('summaryHint')}
            rows={8}
            maxLength={5000}
            lang={form.locale}
            {...field('summary')}
          />
          <TextField
            label={a('summaryAuthorEmail')}
            type="email"
            maxLength={254}
            dir="ltr"
            {...field('summaryAuthorEmail')}
          />
          <TextareaField
            label={a('commentary')}
            rows={6}
            maxLength={5000}
            lang={form.locale}
            {...field('commentary')}
          />
          <TextField
            label={a('commentaryAuthorEmail')}
            type="email"
            maxLength={254}
            dir="ltr"
            {...field('commentaryAuthorEmail')}
          />
          <TextareaField
            label={a('keyPoints')}
            rows={5}
            lang={form.locale}
            {...field('keyPoints')}
          />
          {saved && <Alert tone="success">{a('saved')}</Alert>}
          {editable && (
            <div>
              <Button
                type="submit"
                pending={pending}
                disabled={
                  !form.subspecialtyId ||
                  !form.articleTitle.trim() ||
                  !form.summary.trim() ||
                  !form.summaryAuthorEmail.trim()
                }
              >
                {a('save')}
              </Button>
            </div>
          )}
        </form>
      )}
      {entry && (
        <section
          aria-labelledby="journal-club-review"
          className="flex max-w-3xl flex-col gap-3 rounded-md border border-border p-5"
        >
          <h2 id="journal-club-review" className="text-xl font-semibold">
            {a('status')}: {a(`statuses.${entry.status}`)}
          </h2>
          {entry.ownSubmission && <Alert>{a('ownSubmission')}</Alert>}
          {entry.status === 'IN_REVIEW' && !entry.ownSubmission && (
            <TextareaField
              label={a('sendBackComment')}
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-3">
            {ACTIONS[entry.status]
              .filter((action) => !(entry.ownSubmission && action === 'PUBLISH'))
              .filter((action) => !(entry.ownSubmission && action === 'SEND_BACK'))
              .map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant={action === 'PUBLISH' || action === 'SUBMIT' ? 'primary' : 'secondary'}
                  disabled={pending || (action === 'SEND_BACK' && !comment.trim())}
                  onClick={() => step(action)}
                >
                  {a(`actions.${action}`)}
                </Button>
              ))}
          </div>
          {(entry.status === 'PUBLISHED' || entry.status === 'ARCHIVED') && (
            <Link href={`/journal-club/${entry.id}`} className={link}>
              {a('view')}
            </Link>
          )}
          {history.length > 0 && (
            <>
              <h3 className="mt-2 font-semibold">{a('history')}</h3>
              <ol className="flex flex-col gap-1 text-sm" data-testid="journal-club-history">
                {history.map((item, index) => (
                  <li key={index}>
                    {format.dateTime(new Date(item.at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}{' '}
                    · {a(`statuses.${item.toStatus}`)}
                    {item.actor && ` · ${item.actor.firstName} ${item.actor.lastName}`}
                    {item.comment && ` · ${item.comment}`}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );
}
