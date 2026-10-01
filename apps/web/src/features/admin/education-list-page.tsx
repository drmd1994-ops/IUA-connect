'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { EDUCATION_TYPES, type EducationType } from '@/features/education/education-list';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { EDUCATION_STATUSES, type EducationStatus } from './education-review';

type List = components['schemas']['AdminEducationListDto'];

const PAGE_SIZE = 25;
const link = 'font-semibold text-primary underline underline-offset-4';

/** Every education item with its state. "Waiting for review" is the reviewers' queue. */
export function EducationListPage() {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`education.admin.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const { api, call, me } = useAuth();
  // Reviewers start on their queue; editors on everything.
  const [status, setStatus] = useState<EducationStatus | ''>(
    me?.permissions.some((p) => p === 'education.review') ? 'IN_REVIEW' : '',
  );
  const [type, setType] = useState<EducationType | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/education', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(status ? { status } : {}),
            ...(type ? { type } : {}),
            ...(q ? { q } : {}),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, status, type, q]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/education/questions" className={link}>
            {a('questionsLink')}
          </Link>
          <Link
            href="/admin/education/new"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {a('new')}
          </Link>
        </div>
      </div>
      <form
        role="search"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
          setPage(1);
        }}
      >
        <TextField
          label={a('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={a('status')}
          placeholder={a('allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EducationStatus | '');
            setPage(1);
          }}
          options={EDUCATION_STATUSES.map((s) => ({ value: s, label: a(`statuses.${s}`) }))}
        />
        <SelectField
          label={a('type')}
          placeholder={a('allTypes')}
          value={type}
          onChange={(event) => {
            setType(event.target.value as EducationType | '');
            setPage(1);
          }}
          options={EDUCATION_TYPES.map((value) => ({
            value,
            label: t(`education.types.${value}`),
          }))}
        />
        <div>
          <Button type="submit">{a('searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {a('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{a('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="education-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(['colTitle', 'colType', 'colStatus', 'colAccess', 'colUpdated'] as const).map(
                      (column) => (
                        <th key={column} scope="col" className="p-3 text-start">
                          {a(column)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link href={`/admin/education/${item.id}`} className={link}>
                          {(locale === 'he'
                            ? (item.titleHe ?? item.titleEn)
                            : (item.titleEn ?? item.titleHe)) ?? a('untitled')}
                        </Link>
                      </td>
                      <td className="p-3">{t(`education.types.${item.type}`)}</td>
                      <td className="p-3">{a(`statuses.${item.status}`)}</td>
                      <td className="p-3">{t(`content.common.tiers.${item.accessTier}`)}</td>
                      <td className="p-3">
                        {format.dateTime(new Date(item.updatedAt), {
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
          <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
