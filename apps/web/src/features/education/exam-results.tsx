'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Schemas = components['schemas'];
type Results = Schemas['ExamResultsDto'];
type Progress = Schemas['ExamProgressDto'];
type Bookmarks = Schemas['ExamBookmarkListDto']['items'];
type Reports = Schemas['MyExamReportListDto']['items'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';
const cell = 'p-3 text-start';

/**
 * The signed-in person's own exam results and progress (M6, M23): by topic and by week from
 * first answers, the weak topics, their bookmarks and their reports. Nobody else can see them.
 */
export function ExamResults() {
  return <RequireSignIn>{() => <ResultsView />}</RequireSignIn>;
}

function ResultsView() {
  const t = useTranslations();
  const r = (key: string, values?: Record<string, string | number>) =>
    t(`education.results.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const { api, call } = useAuth();
  const [results, setResults] = useState<Results | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmarks | null>(null);
  const [reports, setReports] = useState<Reports | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const query = { params: { query: { locale } } };
    Promise.all([
      call(() => api.GET('/api/v1/me/exam-progress')),
      call(() => api.GET('/api/v1/me/exam-results', query)),
      call(() => api.GET('/api/v1/me/exam-bookmarks', query)),
      call(() => api.GET('/api/v1/me/exam-reports', query)),
    ])
      .then(([progressResult, resultsResult, bookmarksResult, reportsResult]) => {
        if (!active) return;
        setProgress(progressResult);
        setResults(resultsResult);
        setBookmarks(bookmarksResult.items);
        setReports(reportsResult.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, locale]);

  async function unbookmark(questionId: string) {
    try {
      await call(() =>
        api.DELETE('/api/v1/me/exam-bookmarks/{questionId}', {
          params: { path: { questionId } },
        }),
      );
      setBookmarks((current) => current?.filter((item) => item.questionId !== questionId) ?? null);
    } catch (caught) {
      setError(caught);
    }
  }

  const topicName = (topic: Progress['topics'][number]) =>
    (locale === 'he' ? topic.nameHe : topic.nameEn) ?? r('noTopic');
  const weak = progress?.topics.filter((topic) => topic.weak) ?? [];

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
        <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/education/exam" className={link}>
            {r('practise')}
          </Link>
          <Link href="/education/exam/mock" className={link}>
            {r('mock')}
          </Link>
        </p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!results && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {results && progress && results.answered === 0 && (
        <p className="text-text-muted">{r('empty')}</p>
      )}
      {results && progress && results.answered > 0 && (
        <>
          <p className="text-xl font-semibold" data-testid="exam-results-summary">
            {r('summary', {
              correct: progress.correct,
              answered: progress.answered,
              percent: progress.percent ?? 0,
            })}
          </p>

          <section aria-labelledby="weak-title" className="flex flex-col gap-2">
            <h2 id="weak-title" className="text-xl font-semibold">
              {r('weakTitle')}
            </h2>
            <p className="text-sm text-text-muted">{r('weakRule')}</p>
            {weak.length === 0 ? (
              <p>{r('noWeak')}</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 ps-6" data-testid="weak-topics">
                {weak.map((topic) => (
                  <li key={topic.key ?? 'none'}>
                    {r('weakLine', {
                      topic: topicName(topic),
                      correct: topic.correct,
                      answered: topic.answered,
                      percent: topic.percent ?? 0,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="topics-title" className="flex flex-col gap-2">
            <h2 id="topics-title" className="text-xl font-semibold">
              {r('byTopic')}
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="progress-topics">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className={cell}>
                      {r('colTopic')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('colAnswered')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('colRight')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('colAvailable')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {progress.topics.map((topic) => (
                    <tr key={topic.key ?? 'none'}>
                      <th scope="row" className={`${cell} font-normal`}>
                        {topicName(topic)}
                        {topic.weak && (
                          <span className={`${badge} ms-2 bg-danger-100 text-danger-700`}>
                            {r('weak')}
                          </span>
                        )}
                      </th>
                      <td className={cell}>{topic.answered}</td>
                      <td className={cell}>
                        {topic.percent === null
                          ? '—'
                          : r('rightOf', { correct: topic.correct, percent: topic.percent })}
                      </td>
                      <td className={cell}>{topic.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="weeks-title" className="flex flex-col gap-2">
            <h2 id="weeks-title" className="text-xl font-semibold">
              {r('byWeek')}
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="progress-weeks">
                <thead className="bg-surface-muted">
                  <tr>
                    <th scope="col" className={cell}>
                      {r('colWeek')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('colAnswered')}
                    </th>
                    <th scope="col" className={cell}>
                      {r('colRight')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {progress.weeks.map((week) => (
                    <tr key={week.start}>
                      <th scope="row" className={`${cell} font-normal`}>
                        {format.dateTime(new Date(`${week.start}T12:00:00Z`), {
                          dateStyle: 'medium',
                        })}
                      </th>
                      <td className={cell}>{week.answered}</td>
                      <td className={cell}>
                        {week.answered === 0
                          ? '—'
                          : r('rightOf', {
                              correct: week.correct,
                              percent: Math.round((week.correct / week.answered) * 100),
                            })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {bookmarks && (
        <section aria-labelledby="bookmarks-title" className="flex flex-col gap-2">
          <h2 id="bookmarks-title" className="text-xl font-semibold">
            {r('bookmarks')}
          </h2>
          {bookmarks.length === 0 ? (
            <p className="text-text-muted">{r('noBookmarks')}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="exam-bookmarks">
              {bookmarks.map((item) => (
                <li
                  key={item.questionId}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span>{item.stem}</span>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => void unbookmark(item.questionId)}
                  >
                    {r('removeBookmark')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {reports && reports.length > 0 && (
        <section aria-labelledby="reports-title" className="flex flex-col gap-2">
          <h2 id="reports-title" className="text-xl font-semibold">
            {r('reports')}
          </h2>
          <ul className="flex flex-col gap-2" data-testid="my-exam-reports">
            {reports.map((report) => (
              <li key={report.id} className="rounded-md border border-border p-3">
                <p className="font-semibold">{report.stem}</p>
                <p className="mt-1 text-sm text-text-muted">
                  {t(`education.exam.report.reasons.${report.reason}`)}
                  {' · '}
                  {r(`reportStatus.${report.status}`)}
                </p>
                {report.response && (
                  <p className="mt-1">{r('reportAnswer', { answer: report.response })}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {results && results.items.length > 0 && (
        <section aria-labelledby="answered-title" className="flex flex-col gap-2">
          <h2 id="answered-title" className="text-xl font-semibold">
            {r('answeredTitle')}
          </h2>
          <ul className="flex flex-col gap-3" data-testid="exam-results">
            {results.items.map((item) => (
              <li key={item.questionId} className="rounded-md border border-border p-4">
                <p className="font-semibold">{item.stem}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  <span
                    className={`${badge} ${
                      item.firstCorrect
                        ? 'bg-success-100 text-success-700'
                        : 'bg-danger-100 text-danger-700'
                    }`}
                  >
                    {item.firstCorrect ? r('firstRight') : r('firstWrong')}
                  </span>
                  <span>{r('attempts', { count: item.attempts })}</span>
                  <span>
                    {r('last', {
                      when: format.dateTime(new Date(item.lastAnsweredAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageFrame>
  );
}
