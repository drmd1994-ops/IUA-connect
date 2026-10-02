'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Pager } from '@/features/content/pager';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Results = components['schemas']['SearchResultsDto'];
type Group = Results['groups'][number];
type SearchType = Group['type'];

const TYPES: SearchType[] = ['news', 'events', 'education', 'guidelines', 'members'];
const link = 'font-semibold text-primary underline underline-offset-4';

const isType = (value: string | null): value is SearchType =>
  value !== null && (TYPES as string[]).includes(value);

/**
 * Global search. The query, and the one type being paged through, live in the address, so a
 * search can be linked to and the browser's back button works.
 */
export function SearchPage({ q, type }: { q: string; type: string | null }) {
  const t = useTranslations();
  const s = (key: string, values?: Record<string, string | number>) =>
    t(`search.page.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const router = useRouter();
  const { status, api, call } = useAuth();
  const only = isType(type) ? type : null;
  const [value, setValue] = useState(q);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<{ for: string; data: Results } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const searchable = q.trim().length >= 2;
  const key = `${q}|${only ?? ''}|${page}`;

  useEffect(() => {
    // Wait for the session to be restored, so members get their results on the first request.
    if (!searchable || status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/search', {
        params: {
          query: { q: q.trim(), locale, ...(only ? { types: only, page } : {}) },
        },
      }),
    )
      .then((data) => {
        if (!active) return;
        setResults({ for: key, data });
        setError(null);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, searchable, q, locale, only, page, key]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = value.trim();
    setPage(1);
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : '/search');
  }

  const address = (extra = '') => `/search?q=${encodeURIComponent(q.trim())}${extra}`;
  const current = results?.for === key ? results.data : null;

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{s('title')}</h1>
        <p className="mt-2 text-text-muted">{s('intro')}</p>
      </div>
      <form role="search" onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <TextField
          label={t('search.box.label')}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={100}
          className="min-w-64 flex-1"
        />
        <Button type="submit">{t('search.box.button')}</Button>
      </form>

      {!searchable && <p className="text-text-muted">{s('prompt')}</p>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {searchable && !current && error === null && (
        <p role="status">{t('membership.common.loading')}</p>
      )}
      {searchable && current && (
        <div className="flex flex-col gap-8" data-testid="search-results">
          {only && (
            <Link href={address()} className={link} onClick={() => setPage(1)}>
              {s('backToAll')}
            </Link>
          )}
          {current.groups.length === 0 ? (
            <p className="text-text-muted">{s('empty', { q: q.trim() })}</p>
          ) : (
            <h2 className="text-xl font-semibold" aria-live="polite">
              {s('resultsFor', { q: q.trim() })}
            </h2>
          )}
          {current.groups.map((group) => {
            const typeName = s(`types.${group.type}`);
            return (
              <section
                key={group.type}
                aria-labelledby={`search-${group.type}`}
                data-testid={`search-group-${group.type}`}
              >
                <h3 id={`search-${group.type}`} className="text-lg font-semibold">
                  {typeName}
                  <span className="ms-2 text-sm font-normal text-text-muted">
                    {s('count', { total: group.total })}
                  </span>
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {group.items.map((item) => (
                    <li key={item.id} className="rounded-md border border-border p-4">
                      <p className="font-semibold" lang={item.locale}>
                        <Link href={item.link} className={link}>
                          {item.title}
                        </Link>
                      </p>
                      {item.excerpt && (
                        <p className="mt-1 text-sm text-text-muted" lang={item.locale}>
                          {item.excerpt}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                {!only && group.total > group.items.length && (
                  <p className="mt-3">
                    <Link
                      href={address(`&type=${group.type}`)}
                      className={link}
                      onClick={() => setPage(1)}
                    >
                      {s('showAllIn', { total: group.total, type: typeName })}
                    </Link>
                  </p>
                )}
                {only && (
                  <div className="mt-4">
                    <Pager
                      page={current.page}
                      pageSize={current.pageSize}
                      total={group.total}
                      onPage={setPage}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageFrame>
  );
}
