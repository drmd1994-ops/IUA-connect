'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { PersonMark } from '@/features/verification/person-mark';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';

type Schemas = components['schemas'];
type List = Schemas['JournalClubListDto'];
type Summary = List['items'][number];
type Entry = Schemas['JournalClubEntryDto'];
type Poll = Entry['poll'];
type Answer = 'YES' | 'PERHAPS' | 'NO';

const ANSWERS: Answer[] = ['YES', 'PERHAPS', 'NO'];
const link = 'font-semibold text-primary underline underline-offset-4';

/** The journal club is for verified people (owner answer §10.2). */
function JournalClubFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('journalClub.list');
  return (
    <RequireSignIn>
      {(me) =>
        me.verified ? (
          children
        ) : (
          <PageFrame>
            <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
            <Alert>{t('verifiedOnly')}</Alert>
            <Link href="/account/verification" className={link}>
              {t('verifyLink')}
            </Link>
          </PageFrame>
        )
      }
    </RequireSignIn>
  );
}

function useMonth() {
  const format = useFormatter();
  return (month: string) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: 'long', year: 'numeric' });
}

/** "Journal, Year" of an article. */
function where(item: { journal: string | null; year: number | null }) {
  return [item.journal, item.year].filter(Boolean).join(', ');
}

function EntryCard({ item, current = false }: { item: Summary; current?: boolean }) {
  const t = useTranslations('journalClub');
  const name = useLocalName();
  const month = useMonth();
  return (
    <article
      className={`flex h-full flex-col gap-2 rounded-lg border bg-surface p-5 shadow-card ${
        current ? 'border-primary' : 'border-border'
      }`}
    >
      <p className="text-sm font-semibold text-primary">
        {month(item.month)} · {name(item.subspecialty)}
      </p>
      <h2 className={current ? 'text-2xl font-semibold' : 'text-lg font-semibold'} dir="auto">
        <Link
          href={`/journal-club/${item.id}`}
          className="text-primary underline underline-offset-4"
        >
          {item.articleTitle}
        </Link>
      </h2>
      {where(item) && <p className="text-sm text-text-muted">{where(item)}</p>}
      <p lang={item.locale} dir={item.locale === 'he' ? 'rtl' : 'ltr'}>
        {item.excerpt}
      </p>
      {item.archived && (
        <p>
          <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text-muted">
            {t('list.archived')}
          </span>
        </p>
      )}
    </article>
  );
}

/** This month's entry first, then the archive by subspecialty and year (M31). */
export function JournalClubList() {
  return (
    <JournalClubFrame>
      <ListPage />
    </JournalClubFrame>
  );
}

function ListPage() {
  const t = useTranslations();
  const name = useLocalName();
  const reference = useReference();
  const { api, call } = useAuth();
  const [subspecialty, setSubspecialty] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/journal-club', {
        params: {
          query: {
            page,
            ...(subspecialty ? { subspecialty } : {}),
            ...(year ? { year: Number(year) } : {}),
          },
        },
      }),
    )
      .then((result) => {
        if (!active) return;
        setList(result);
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, subspecialty, year]);

  const l = (key: string) => t(`journalClub.list.${key}`);
  const thisYear = new Date().getFullYear();
  const others = list?.items.filter((item) => item.id !== list.current?.id) ?? [];
  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{l('title')}</h1>
        <p className="mt-2 text-text-muted">{l('intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list?.current && page === 1 && (
        <section aria-labelledby="journal-club-current" className="flex flex-col gap-3">
          <h2 id="journal-club-current" className="text-xl font-semibold">
            {l('current')}
          </h2>
          <EntryCard item={list.current} current />
        </section>
      )}
      <section aria-labelledby="journal-club-archive" className="flex flex-col gap-4">
        <h2 id="journal-club-archive" className="text-xl font-semibold">
          {l('archive')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label={l('subspecialty')}
            placeholder={l('allSubspecialties')}
            value={subspecialty}
            onChange={(event) => {
              setSubspecialty(event.target.value);
              setPage(1);
            }}
            options={(reference?.subspecialties ?? []).map((s) => ({
              value: s.key,
              label: name(s),
            }))}
          />
          <SelectField
            label={l('year')}
            placeholder={l('allYears')}
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setPage(1);
            }}
            options={Array.from({ length: 5 }, (_, i) => String(thisYear - i)).map((value) => ({
              value,
              label: value,
            }))}
          />
        </div>
        {list && others.length === 0 && (
          <p role="status" className="text-text-muted">
            {l('empty')}
          </p>
        )}
        {others.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="journal-club-list">
            {others.map((item) => (
              <li key={item.id}>
                <EntryCard item={item} />
              </li>
            ))}
          </ul>
        )}
        {list && <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />}
      </section>
    </PageFrame>
  );
}

/** One entry: the article's links, the summary and commentary, the poll, the discussion. */
export function JournalClubEntry({ id }: { id: string }) {
  return (
    <JournalClubFrame>
      <EntryPage id={id} />
    </JournalClubFrame>
  );
}

function Author({
  role,
  person,
}: {
  role: 'summaryBy' | 'commentaryBy';
  person: Entry['summaryAuthor'];
}) {
  const t = useTranslations('journalClub.entry');
  const name = useLocalName();
  if (!person) return null;
  return (
    <p className="text-sm text-text-muted">
      {t(role, { name: `${person.firstName} ${person.lastName}` })}
      <PersonMark mark={person.mark} />
      {person.hospital && `, ${name(person.hospital)}`}
    </p>
  );
}

function EntryPage({ id }: { id: string }) {
  const t = useTranslations();
  const name = useLocalName();
  const month = useMonth();
  const { api, call } = useAuth();
  const [item, setItem] = useState<Entry | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/journal-club/{id}', { params: { path: { id } } }))
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id]);

  const e = (key: string) => t(`journalClub.entry.${key}`);
  const back = (
    <Link href="/journal-club" className={link}>
      {e('back')}
    </Link>
  );
  if (error !== null && !item) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? e('notFound') : errorMessage(error, t)}
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
  const text = { lang: item.locale, dir: item.locale === 'he' ? 'rtl' : 'ltr' } as const;
  return (
    <PageFrame>
      {back}
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">
            {month(item.month)} · {name(item.subspecialty)}
          </p>
          <h1 className="text-3xl font-semibold text-brand-900" dir="auto">
            {item.articleTitle}
          </h1>
          {item.articleAuthors && (
            <p className="text-text" dir="auto">
              {item.articleAuthors}
            </p>
          )}
          {where(item) && <p className="text-text-muted">{where(item)}</p>}
        </header>
        <section
          aria-labelledby="journal-club-article"
          className="flex flex-col gap-2 rounded-md border border-border p-5"
        >
          <h2 id="journal-club-article" className="text-xl font-semibold">
            {e('article')}
          </h2>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {item.doi && (
              <a
                href={`https://doi.org/${item.doi}`}
                className={link}
                rel="noopener noreferrer"
                target="_blank"
              >
                {e('readArticle')}
              </a>
            )}
            {item.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`}
                className={link}
                rel="noopener noreferrer"
                target="_blank"
              >
                {e('onPubmed')}
              </a>
            )}
          </p>
          <p className="text-sm text-text-muted">{e('notCopied')}</p>
        </section>
        <section aria-labelledby="journal-club-summary" className="flex flex-col gap-2">
          <h2 id="journal-club-summary" className="text-xl font-semibold">
            {e('summary')}
          </h2>
          <Author role="summaryBy" person={item.summaryAuthor} />
          <p className="whitespace-pre-line" {...text}>
            {item.summary}
          </p>
        </section>
        {item.keyPoints.length > 0 && (
          <section aria-labelledby="journal-club-points" className="flex flex-col gap-2">
            <h2 id="journal-club-points" className="text-xl font-semibold">
              {e('keyPoints')}
            </h2>
            <ul className="list-disc ps-6" {...text}>
              {item.keyPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        )}
        {item.commentary && (
          <section aria-labelledby="journal-club-commentary" className="flex flex-col gap-2">
            <h2 id="journal-club-commentary" className="text-xl font-semibold">
              {e('commentary')}
            </h2>
            <Author role="commentaryBy" person={item.commentaryAuthor} />
            <p className="whitespace-pre-line" {...text}>
              {item.commentary}
            </p>
          </section>
        )}
        <PollSection
          id={item.id}
          poll={item.poll}
          onChange={(poll) => setItem({ ...item, poll })}
        />
        <section aria-labelledby="journal-club-discussion" className="flex flex-col gap-2">
          <h2 id="journal-club-discussion" className="text-xl font-semibold">
            {e('discussion')}
          </h2>
          {item.discussion ? (
            <Link
              href={`/communities/${item.discussion.communitySlug}/${item.discussion.postId}`}
              className={link}
            >
              {e('openDiscussion')}
            </Link>
          ) : (
            <p className="text-text-muted">{e('noDiscussion')}</p>
          )}
        </section>
      </article>
    </PageFrame>
  );
}

/** "Would this change your practice?": anonymous, totals after answering or once closed. */
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

  async function vote(answer: Answer) {
    setPending(true);
    setError(null);
    try {
      onChange(
        await call(() =>
          api.PUT('/api/v1/journal-club/{id}/vote', {
            params: { path: { id } },
            body: { answer },
          }),
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const e = (key: string, values?: Record<string, string | number>) =>
    t(`journalClub.entry.${key}`, values);
  const totals = poll.totals;
  return (
    <section
      aria-labelledby="journal-club-poll"
      className="flex flex-col gap-3 rounded-md border border-border p-5"
    >
      <h2 id="journal-club-poll" className="text-xl font-semibold">
        {e('poll')}
      </h2>
      <p className="text-sm text-text-muted">{e('pollNote')}</p>
      {poll.open ? (
        <div className="flex flex-wrap gap-3" role="group" aria-label={e('poll')}>
          {ANSWERS.map((answer) => (
            <button
              key={answer}
              type="button"
              disabled={pending}
              aria-pressed={poll.mine === answer}
              onClick={() => void vote(answer)}
              className={`rounded-md border px-4 py-2 font-semibold disabled:opacity-60 ${
                poll.mine === answer
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border text-text hover:bg-surface-muted'
              }`}
            >
              {e(`answers.${answer}`)}
            </button>
          ))}
        </div>
      ) : (
        <p>{e('pollClosed')}</p>
      )}
      {poll.mine && <p role="status">{e('yourAnswer', { answer: e(`answers.${poll.mine}`) })}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {totals && (
        <div className="flex flex-col gap-2" data-testid="journal-club-totals">
          <p className="text-sm text-text-muted">{e('totals', { count: totals.total })}</p>
          {ANSWERS.map((answer) => {
            const percent = totals.total ? Math.round((totals[answer] / totals.total) * 100) : 0;
            return (
              <div key={answer} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm">
                  {e('share', { answer: e(`answers.${answer}`), percent })}
                </span>
                <span
                  aria-hidden="true"
                  className="h-3 rounded-full bg-primary"
                  style={{ width: `${Math.max(percent, 1)}%`, maxWidth: '60%' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
