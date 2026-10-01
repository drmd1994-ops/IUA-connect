'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Results = components['schemas']['ExamResultsDto'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** The signed-in person's own exam results. Nobody else can see them. */
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
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/exam-results', { params: { query: { locale } } }))
      .then((result) => active && setResults(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, locale]);

  return (
    <PageFrame>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{r('title')}</h1>
        <p className="mt-2 text-text-muted">{r('intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!results && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {results && results.answered === 0 && <p className="text-text-muted">{r('empty')}</p>}
      {results && results.answered > 0 && (
        <>
          <p className="text-xl font-semibold" data-testid="exam-results-summary">
            {r('summary', {
              correct: results.correct,
              answered: results.answered,
              percent: results.percent ?? 0,
            })}
          </p>
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
        </>
      )}
      <Link href="/education/exam" className={link}>
        {r('practise')}
      </Link>
    </PageFrame>
  );
}
