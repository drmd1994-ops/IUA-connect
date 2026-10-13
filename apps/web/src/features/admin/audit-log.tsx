'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type List = components['schemas']['AuditLogListDto'];

const PAGE_SIZE = 50;
const link = 'font-semibold text-primary underline underline-offset-4';

interface Filters {
  action: string;
  actor: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
}
const NO_FILTERS: Filters = {
  action: '',
  actor: '',
  entityType: '',
  entityId: '',
  from: '',
  to: '',
};

/**
 * The audit log: read-only. `initial` comes from the address, so other screens can link to
 * "this account in the audit log".
 */
export function AuditLogPage({ initial }: { initial: Partial<Filters> }) {
  const t = useTranslations();
  const a = (key: string, values?: Record<string, string | number>) =>
    t(`portal.admin.audit.${key}`, values);
  const format = useFormatter();
  const { api, call } = useAuth();
  const [draft, setDraft] = useState<Filters>({ ...NO_FILTERS, ...initial });
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, ...initial });
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const query = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value.trim() !== ''),
    );
    call(() =>
      api.GET('/api/v1/admin/audit-logs', {
        params: { query: { page, pageSize: PAGE_SIZE, ...query } },
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
  }, [api, call, page, filters]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters(
      Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value.trim()]),
      ) as unknown as Filters,
    );
  }
  const field = (key: keyof Filters) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
        <p className="mt-2 text-text-muted">{a('intro')}</p>
      </div>
      <form
        role="search"
        onSubmit={apply}
        noValidate
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <TextField
          label={a('action')}
          hint={a('actionHint')}
          dir="ltr"
          maxLength={100}
          {...field('action')}
        />
        <TextField
          label={a('actor')}
          hint={a('actorHint')}
          dir="ltr"
          maxLength={254}
          {...field('actor')}
        />
        <TextField label={a('entityType')} dir="ltr" maxLength={100} {...field('entityType')} />
        <TextField label={a('entityId')} dir="ltr" maxLength={100} {...field('entityId')} />
        <TextField label={a('from')} type="date" {...field('from')} />
        <TextField label={a('to')} type="date" {...field('to')} />
        <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit">{a('filter')}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(NO_FILTERS);
              setFilters(NO_FILTERS);
              setPage(1);
            }}
          >
            {a('clear')}
          </Button>
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
              <table className="w-full text-sm" data-testid="audit-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      ['colWhen', 'colWho', 'colWhat', 'colOn', 'colFrom', 'colDetails'] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {a(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((entry) => (
                    <tr key={entry.id} className="align-top">
                      <td className="whitespace-nowrap p-3">
                        {format.dateTime(new Date(entry.at), {
                          dateStyle: 'medium',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="p-3">
                        {entry.actor ? (
                          <Link href={`/admin/users/${entry.actor.id}`} className={link}>
                            <span dir="ltr">{entry.actor.email ?? a('unknownActor')}</span>
                          </Link>
                        ) : (
                          a('system')
                        )}
                      </td>
                      <td className="p-3" dir="ltr">
                        <code>{entry.action}</code>
                      </td>
                      <td className="p-3" dir="ltr">
                        {entry.entityType ?? ''}
                        {entry.entityId && (
                          <span className="block break-all text-xs text-text-muted">
                            {entry.entityId}
                          </span>
                        )}
                      </td>
                      <td className="p-3" dir="ltr">
                        {entry.actorIp ?? ''}
                      </td>
                      <td className="p-3">
                        {entry.changes && Object.keys(entry.changes).length > 0 ? (
                          <pre
                            dir="ltr"
                            className="max-w-md whitespace-pre-wrap break-words text-xs"
                          >
                            {JSON.stringify(entry.changes, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-text-muted">{a('noDetails')}</span>
                        )}
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
