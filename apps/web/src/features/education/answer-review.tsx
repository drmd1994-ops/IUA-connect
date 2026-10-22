'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';

const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

export interface ReviewedOption {
  position: number;
  text: string;
  correct: boolean | null;
  explanation: string | null;
}

/**
 * A question after it was answered, in practice or at the end of a mock exam (M6, M23): every
 * option with why it is right or wrong, the reader's choice, the topic's summary, the references
 * the answer rests on, and who reviewed the question.
 */
export function AnswerReview({
  options,
  chosenPosition,
  summary,
  references,
  reviewer,
  lang,
}: {
  options: ReviewedOption[];
  chosenPosition: number | null;
  summary: string | null;
  references: { title: string; url?: string }[];
  reviewer: { nameHe: string | null; nameEn: string | null; at: string } | null;
  /** The language of the question's text. */
  lang: 'he' | 'en';
}) {
  const t = useTranslations();
  const e = (key: string, values?: Record<string, string | number>) =>
    t(`education.exam.${key}`, values);
  const locale = useLocale();
  const format = useFormatter();
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const who = reviewer
    ? locale === 'he'
      ? (reviewer.nameHe ?? reviewer.nameEn)
      : (reviewer.nameEn ?? reviewer.nameHe)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3" lang={lang} dir={dir}>
        {options.map((option) => (
          <li
            key={option.position}
            className={`rounded-md border p-4 ${option.correct ? 'border-success-700' : 'border-border'}`}
          >
            <p className="font-semibold">{option.text}</p>
            <p className="mt-1 flex flex-wrap gap-2">
              {option.correct && (
                <span className={`${badge} bg-success-100 text-success-700`}>
                  {e('rightAnswer')}
                </span>
              )}
              {option.position === chosenPosition && (
                <span className={`${badge} bg-surface-muted text-text`}>{e('yourAnswer')}</span>
              )}
            </p>
            {option.explanation && (
              <>
                <p className="mt-2 text-sm font-semibold text-text-muted">
                  {option.correct ? e('whyRight') : e('whyWrong')}
                </p>
                <p className="whitespace-pre-line">{option.explanation}</p>
              </>
            )}
          </li>
        ))}
      </ul>

      {summary && (
        <div className="rounded-md bg-surface-muted p-4" lang={lang} dir={dir}>
          <h3 className="font-semibold">{e('summary')}</h3>
          <p className="mt-1 whitespace-pre-line">{summary}</p>
        </div>
      )}

      {references.length > 0 && (
        <div data-testid="exam-references">
          <h3 className="font-semibold">{e('references')}</h3>
          <ol className="mt-1 flex list-decimal flex-col gap-1 ps-6">
            {references.map((reference, index) => (
              <li key={index}>
                {reference.url ? (
                  <a
                    href={reference.url}
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline underline-offset-4"
                  >
                    {reference.title}
                  </a>
                ) : (
                  reference.title
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {reviewer && (
        <p className="text-sm text-text-muted" data-testid="reviewed-by">
          {who
            ? e('reviewedBy', {
                name: who,
                date: format.dateTime(new Date(reviewer.at), { dateStyle: 'long' }),
              })
            : e('reviewedOn', {
                date: format.dateTime(new Date(reviewer.at), { dateStyle: 'long' }),
              })}
        </p>
      )}
    </div>
  );
}
