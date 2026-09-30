'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api-errors';

type Batch = components['schemas']['ImportBatchDto'];
type Action = Batch['rows'][number]['action'];
const ACTIONS: Action[] = [
  'CREATE_ACCOUNT',
  'CREATE_MEMBERSHIP',
  'UPDATE_MEMBERSHIP',
  'UNCHANGED',
  'SKIP',
];

/**
 * CSV import: the browser reads the file, the API checks it (dry run, nothing changes), then the
 * same file is sent again to apply it.
 */
export function ImportPage() {
  const t = useTranslations();
  const fileId = useId();
  const { api, call } = useAuth();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [pending, setPending] = useState<'dry' | 'apply' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function dryRun(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPending('dry');
    setError(null);
    setBatch(null);
    try {
      setBatch(
        await call(() =>
          api.POST('/api/v1/admin/memberships/import', {
            body: { fileName: file.name, csv: file.text },
          }),
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  async function apply() {
    if (!file || !batch?.batchId) return;
    setPending('apply');
    setError(null);
    try {
      setBatch(
        await call(() =>
          api.POST('/api/v1/admin/memberships/import/{batchId}/apply', {
            params: { path: { batchId: batch.batchId! } },
            body: { csv: file.text },
          }),
        ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  const reason = (code: string) => {
    const key = `admin.import.reasons.${code}`;
    return t.has(key) ? t(key) : code;
  };
  const changes = (codes: string[]) =>
    codes
      .map((code) =>
        t.has(`admin.import.changes.${code}`) ? t(`admin.import.changes.${code}`) : code,
      )
      .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('admin.import.title')}</h1>
        <p className="mt-2 text-text-muted">{t('admin.import.intro')}</p>
      </div>
      <section className="rounded-md border border-border p-4 text-sm">
        <h2 className="font-semibold">{t('admin.import.columnsTitle')}</h2>
        <p className="mt-1" dir="auto">
          {t('admin.import.columns')}
        </p>
        <p className="mt-1">{t('admin.import.newAccounts')}</p>
      </section>
      <form onSubmit={dryRun} className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="font-semibold">
            {t('admin.import.file')}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              setBatch(null);
              setFile(chosen ? { name: chosen.name, text: await chosen.text() } : null);
            }}
          />
        </div>
        <Button type="submit" pending={pending === 'dry'} disabled={!file}>
          {t('admin.import.dryRun')}
        </Button>
      </form>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}

      {batch && batch.fileErrors.length > 0 && (
        <Alert tone="error">
          <ul>
            {batch.fileErrors.map((fileError) => (
              <li key={`${fileError.code}-${fileError.column ?? ''}-${fileError.line ?? ''}`}>
                {t(`admin.import.fileErrors.${fileError.code}`, {
                  column: fileError.column ?? '',
                  line: fileError.line ?? 0,
                })}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {batch && batch.batchId && (
        <section className="flex flex-col gap-4" aria-labelledby="report-heading">
          <h2 id="report-heading" className="text-xl font-semibold">
            {batch.status === 'APPLIED'
              ? t('admin.import.appliedTitle')
              : t('admin.import.reportTitle')}
          </h2>
          {batch.status === 'APPLIED' && <Alert tone="success">{t('admin.import.applied')}</Alert>}
          <dl
            className="grid gap-3 sm:grid-cols-5"
            aria-label={t('admin.import.totals')}
            data-testid="import-totals"
          >
            {ACTIONS.map((action) => (
              <div key={action} className="rounded-md border border-border p-3">
                <dt className="text-sm text-text-muted">{t(`admin.import.actions.${action}`)}</dt>
                <dd className="text-2xl font-semibold">{batch.totals[action] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid="import-report">
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="p-2 text-start">
                    {t('admin.import.line')}
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {t('admin.import.email')}
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {t('admin.import.action')}
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {t('admin.import.details')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batch.rows.map((row) => (
                  <tr key={row.line}>
                    <td className="p-2">{row.line}</td>
                    <td className="p-2" dir="ltr">
                      {row.email ?? t('membership.common.none')}
                    </td>
                    <td className="p-2">{t(`admin.import.actions.${row.action}`)}</td>
                    <td className="p-2">
                      {[...row.reasons.map(reason), changes(row.changes)]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.status === 'DRY_RUN' && (
            <div>
              <Button type="button" pending={pending === 'apply'} onClick={() => void apply()}>
                {t('admin.import.apply')}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
