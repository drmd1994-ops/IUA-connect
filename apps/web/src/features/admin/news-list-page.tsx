'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['AdminNewsListDto'];
export type NewsStatus = List['items'][number]['status'];

export const NEWS_STATUSES: NewsStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
];
const PAGE_SIZE = 25;
const link = 'font-semibold text-primary underline underline-offset-4';

/** Every news item with its state. "Waiting for review" is the reviewers' queue. */
export function NewsListPage() {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const { api, call, me } = useAuth();
  // Reviewers start on their queue; editors on everything.
  const [status, setStatus] = useState<NewsStatus | ''>(
    me?.permissions.includes('news.review') ? 'IN_REVIEW' : '',
  );
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/news', {
        params: {
          query: { page, pageSize: PAGE_SIZE, ...(status ? { status } : {}), ...(q ? { q } : {}) },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status, q]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-900">{t('content.adminNews.title')}</h1>
        <div className="flex flex-wrap items-center gap-4">
          {me?.platformPermissions.includes('news.review') && (
            <Link href="/admin/news/categories" className={link}>
              {t('content.adminNews.categoriesLink')}
            </Link>
          )}
          <Link
            href="/admin/news/new"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {t('content.adminNews.new')}
          </Link>
        </div>
      </div>
      <form
        role="search"
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          label={t('content.adminNews.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={t('content.adminNews.status')}
          placeholder={t('content.adminNews.allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as NewsStatus | '');
            setPage(1);
          }}
          options={NEWS_STATUSES.map((s) => ({
            value: s,
            label: t(`content.adminNews.statuses.${s}`),
          }))}
        />
        <div>
          <Button type="submit">{t('content.adminNews.searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {t('content.adminNews.total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{t('content.adminNews.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="news-table">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className="p-3 text-start">
                      {t('content.adminNews.colTitle')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('content.adminNews.colStatus')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('content.adminNews.colAccess')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('content.adminNews.colUpdated')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => {
                    const title =
                      (locale === 'he'
                        ? (item.titleHe ?? item.titleEn)
                        : (item.titleEn ?? item.titleHe)) ?? t('content.adminNews.untitled');
                    return (
                      <tr key={item.id}>
                        <td className="p-3">
                          <Link href={`/admin/news/${item.id}`} className={link}>
                            {title}
                          </Link>
                          {item.revisionOfId && (
                            <span className="ms-2 text-text-muted">
                              {t('content.adminNews.revisionOf')}
                            </span>
                          )}
                          {item.revisionId && (
                            <span className="ms-2 text-text-muted">
                              {t('content.adminNews.hasRevision')}
                            </span>
                          )}
                        </td>
                        <td className="p-3">{t(`content.adminNews.statuses.${item.status}`)}</td>
                        <td className="p-3">{t(`content.common.tiers.${item.accessTier}`)}</td>
                        <td className="p-3">
                          {format.dateTime(new Date(item.updatedAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
