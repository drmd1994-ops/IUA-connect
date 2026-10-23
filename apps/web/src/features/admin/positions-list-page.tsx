'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['AdminPositionListDto'];
type Status = List['items'][number]['status'];

const PAGE_SIZE = 25;
const STATUSES: Status[] = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'];
const link = 'font-semibold text-primary underline underline-offset-4';

/** The positions the reader writes or reviews (M28). The API decides which. */
export function PositionsListPage() {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<Status | ''>('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/positions', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            ...(status ? { status } : {}),
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
  }, [api, call, page, status, q]);

  const a = (key: string) => t(`careers.admin.${key}`);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
          <p className="mt-2 text-text-muted">{a('intro')}</p>
        </div>
        <Link
          href="/admin/positions/new"
          className="rounded-md bg-primary px-4 py-2.5 font-semibold text-on-primary hover:bg-primary-hover"
        >
          {a('new')}
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          className="max-w-xs"
          label={a('status')}
          placeholder={a('allStatuses')}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as Status | '');
            setPage(1);
          }}
          options={STATUSES.map((value) => ({
            value,
            label: t(`careers.admin.statuses.${value}`),
          }))}
        />
        <form
          role="search"
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setQ(typed.trim());
            setPage(1);
          }}
        >
          <TextField
            label={a('search')}
            type="search"
            value={typed}
            maxLength={100}
            onChange={(event) => setTyped(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('careers.positions.search')}
          </Button>
        </form>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{a('empty')}</p>}
      {list && list.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-start" data-testid="admin-positions">
            <thead>
              <tr className="border-b border-border text-sm text-text-muted">
                <th scope="col" className="p-2 text-start">
                  {a('columns.title')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('columns.owner')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('columns.status')}
                </th>
                <th scope="col" className="p-2 text-start">
                  {a('columns.closes')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => {
                const title =
                  (locale === 'he' ? item.titleHe : item.titleEn) ?? item.titleHe ?? item.titleEn;
                return (
                  <tr key={item.id} className="border-b border-border">
                    <td className="p-2">
                      <Link href={`/admin/positions/${item.id}`} className={link}>
                        {title}
                      </Link>
                    </td>
                    <td className="p-2">
                      {item.organisation ? name(item.organisation) : a('ownerPlatform')}
                    </td>
                    <td className="p-2">{t(`careers.admin.statuses.${item.status}`)}</td>
                    <td className="p-2">
                      {format.dateTime(new Date(`${item.closesOn}T12:00:00Z`), {
                        dateStyle: 'medium',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </div>
  );
}
