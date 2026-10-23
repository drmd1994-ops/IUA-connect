'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { Pager } from '@/features/content/pager';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type ImportResult = Schemas['ExamImportResultDto'];
type Reports = Schemas['AdminExamReportListDto'];
type ReportStatus = Reports['items'][number]['status'];

const link = 'font-semibold text-primary underline underline-offset-4';
const PAGE_SIZE = 25;
const REPORT_STATUSES: ReportStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];
/** What a file read with the wrong encoding shows instead of Hebrew letters. */
const REPLACEMENT = String.fromCharCode(0xfffd);

/**
 * Importing questions from a spreadsheet (M23 plan §2). Every question arrives as a draft and
 * goes through the usual review; a file with any bad row is refused whole, row by row.
 */
export function ExamImportPage() {
  const t = useTranslations();
  const i = (key: string, values?: Record<string, string | number>) =>
    t(`education.admin.import.${key}`, values);
  const { api, call } = useAuth();
  const name = useLocalName();
  const reference = useReference();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [badEncoding, setBadEncoding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await call(() =>
        api.GET('/api/v1/admin/exam-questions/import-template', { parseAs: 'text' }),
      );
      const url = URL.createObjectURL(new Blob([csv as string], { type: 'text/csv' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'exam-questions-template.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    setResult(null);
    setBadEncoding(false);
    try {
      const csv = await file.text();
      // Saved as plain "CSV" rather than "CSV UTF-8", Hebrew can't be read: say so, send nothing.
      if (csv.includes(REPLACEMENT)) {
        setBadEncoding(true);
        return;
      }
      setResult(
        await call(() => api.POST('/api/v1/admin/exam-questions/import', { body: { csv } })),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/education/questions" className={link}>
          {t('education.admin.questions.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{i('title')}</h1>
        <p className="mt-2 text-text-muted">{i('intro')}</p>
      </div>
      <ol className="flex list-decimal flex-col gap-2 ps-6">
        <li>
          {i('step1')}{' '}
          <Button type="button" variant="link" onClick={() => void downloadTemplate()}>
            {i('template')}
          </Button>
        </li>
        <li>{i('step2')}</li>
        <li>{i('step3')}</li>
      </ol>
      <details className="rounded-md border border-border p-4">
        <summary className="cursor-pointer font-semibold">{i('keysTitle')}</summary>
        <p className="mt-3 text-sm text-text-muted">{i('keysIntro')}</p>
        <table className="mt-3 text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2 text-start">
                {i('colKey')}
              </th>
              <th scope="col" className="p-2 text-start">
                {i('colTopic')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(reference?.subspecialties ?? []).map((s) => (
              <tr key={s.key}>
                <td className="p-2 font-mono" dir="ltr">
                  {s.key}
                </td>
                <td className="p-2">{name(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <form onSubmit={submit} noValidate className="flex flex-col items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="font-semibold">
            {i('file')}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setBadEncoding(false);
            }}
          />
        </div>
        <Button type="submit" pending={pending} disabled={!file}>
          {i('submit')}
        </Button>
      </form>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {badEncoding && <Alert tone="error">{i('encoding')}</Alert>}
      {result && result.imported > 0 && (
        <Alert tone="success">
          {i('imported', { count: result.imported })}{' '}
          <Link href="/admin/education/questions" className={link}>
            {i('toDrafts')}
          </Link>
        </Alert>
      )}
      {result && result.problems.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="import-problems">
          <Alert tone="error">{i('refused', { count: result.problems.length })}</Alert>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th scope="col" className="p-3 text-start">
                    {i('row')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {i('column')}
                  </th>
                  <th scope="col" className="p-3 text-start">
                    {i('reason')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.problems.map((problem, index) => (
                  <tr key={index}>
                    <td className="p-3">{problem.row || '—'}</td>
                    <td className="p-3" dir="ltr">
                      {problem.column ?? '—'}
                    </td>
                    <td className="p-3">
                      {t.has(`education.admin.import.codes.${problem.code}`)
                        ? i(`codes.${problem.code}`)
                        : problem.code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The reviewers' queue of readers' reports (M23 plan §2). Reviewers never see who sent a report;
 * their answer goes to the reader. A question stays published unless a reviewer takes it down
 * on its own page.
 */
export function ExamReportsPage() {
  const t = useTranslations();
  const r = (key: string, values?: Record<string, string | number>) =>
    t(`education.admin.reports.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const { api, call } = useAuth();
  const [status, setStatus] = useState<ReportStatus>('OPEN');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Reports | null>(null);
  const [error, setError] = useState<unknown>(null);
  /** Increases to reload after a decision. */
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/exam-reports', {
        params: { query: { status, page, pageSize: PAGE_SIZE } },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, page, turn]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/education/questions" className={link}>
          {t('education.admin.questions.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      <div role="group" aria-label={r('status')} className="flex flex-wrap gap-2">
        {REPORT_STATUSES.map((value) => (
          <Button
            key={value}
            type="button"
            variant={status === value ? 'primary' : 'secondary'}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
              setList(null);
            }}
          >
            {r(`statuses.${value}`)}
          </Button>
        ))}
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && <p className="text-text-muted">{r('empty')}</p>}
      {list && list.items.length > 0 && (
        <ul className="flex flex-col gap-4" data-testid="exam-reports">
          {list.items.map((report) => (
            <li key={report.id} className="flex flex-col gap-2 rounded-md border border-border p-4">
              <Link href={`/admin/education/questions/${report.questionId}`} className={link}>
                {(locale === 'he'
                  ? (report.stemHe ?? report.stemEn)
                  : (report.stemEn ?? report.stemHe)) ?? t('education.admin.untitled')}
              </Link>
              <p className="text-sm text-text-muted">
                {r('meta', {
                  reason: t(`education.exam.report.reasons.${report.reason}`),
                  when: format.dateTime(new Date(report.createdAt), { dateStyle: 'medium' }),
                  status: t(`education.admin.statuses.${report.questionStatus}`),
                })}
              </p>
              {report.text && <p className="whitespace-pre-line">{report.text}</p>}
              {report.status === 'OPEN' ? (
                <Decision id={report.id} onDone={() => setTurn((value) => value + 1)} />
              ) : (
                <p className="text-sm">
                  <span className="font-semibold">{r(`statuses.${report.status}`)}</span>
                  {report.response && `: ${report.response}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {list && <Pager page={page} pageSize={PAGE_SIZE} total={list.total} onPage={setPage} />}
    </div>
  );
}

function Decision({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslations();
  const r = (key: string) => t(`education.admin.reports.${key}`);
  const { api, call } = useAuth();
  const groupId = useId();
  const [outcome, setOutcome] = useState<'RESOLVED' | 'DISMISSED' | null>(null);
  const [response, setResponse] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!outcome || !response.trim()) return;
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/admin/exam-reports/{id}/decision', {
          params: { path: { id } },
          body: { outcome, response: response.trim() },
        }),
      );
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{r('decide')}</legend>
        {(['RESOLVED', 'DISMISSED'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name={groupId}
              className="size-4"
              checked={outcome === value}
              onChange={() => setOutcome(value)}
            />
            {r(`outcomes.${value}`)}
          </label>
        ))}
      </fieldset>
      <TextareaField
        label={r('response')}
        hint={r('responseHint')}
        value={response}
        onChange={(event) => setResponse(event.target.value)}
        maxLength={1000}
        rows={3}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div>
        <Button type="submit" pending={pending} disabled={!outcome || !response.trim()}>
          {r('send')}
        </Button>
      </div>
    </form>
  );
}
