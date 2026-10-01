'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useEventTime } from '@/features/events/shared';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['AdminEventListDto'];
export type EventStatus = List['items'][number]['status'];

const STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED', 'CANCELLED'];
const PAGE_SIZE = 25;
const ZONE = 'Asia/Jerusalem';
const link = 'font-semibold text-primary underline underline-offset-4';

/** Every event with its state, newest first. */
export function EventsListPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { dateTime } = useEventTime();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/events', {
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
        <h1 className="text-3xl font-semibold text-brand-900">{t('events.admin.title')}</h1>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin/events/speakers" className={link}>
            {t('events.admin.speakersLink')}
          </Link>
          <Link href="/admin/events/categories" className={link}>
            {t('events.admin.categoriesLink')}
          </Link>
          <Link
            href="/admin/events/new"
            className="rounded-md bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
          >
            {t('events.admin.new')}
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
          label={t('events.admin.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={t('events.admin.status')}
          placeholder={t('events.admin.allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EventStatus | '');
            setPage(1);
          }}
          options={STATUSES.map((s) => ({ value: s, label: t(`events.admin.statuses.${s}`) }))}
        />
        <div>
          <Button type="submit">{t('events.admin.searchButton')}</Button>
        </div>
      </form>

      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {t('events.admin.total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{t('events.admin.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="events-table">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className="p-3 text-start">
                      {t('events.admin.colTitle')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('events.admin.colStatus')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('events.admin.colStart')}
                    </th>
                    <th scope="col" className="p-3 text-start">
                      {t('events.admin.colRegistration')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">
                        <Link href={`/admin/events/${item.id}`} className={link}>
                          {(locale === 'he'
                            ? (item.titleHe ?? item.titleEn)
                            : (item.titleEn ?? item.titleHe)) ?? t('events.admin.untitled')}
                        </Link>
                      </td>
                      <td className="p-3">{t(`events.admin.statuses.${item.status}`)}</td>
                      <td className="p-3">
                        {item.startAt ? dateTime(item.startAt, ZONE) : t('events.admin.noDate')}
                      </td>
                      <td className="p-3">{t(`events.admin.modes.${item.registrationMode}`)}</td>
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
