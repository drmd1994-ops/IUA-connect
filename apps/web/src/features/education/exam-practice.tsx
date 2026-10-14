'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { EDUCATION_LEVELS, type EducationLevel } from './education-list';

type Schemas = components['schemas'];
type Question = NonNullable<Schemas['NextQuestionDto']['question']>;
type Result = Schemas['AnswerResultDto'];

const link = 'font-semibold text-primary underline underline-offset-4';
const badge = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/**
 * Exam practice (M6 plan §2.10), in the layout the owner asked for: one multiple-choice question;
 * after the reader answers, the right answer, why each option is right or wrong, and a short
 * summary of the topic. The answer and the explanations arrive only in the reply to an answer.
 */
export function ExamPractice() {
  const t = useTranslations();
  const e = (key: string, values?: Record<string, string | number>) =>
    t(`education.exam.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const name = useLocalName();
  const reference = useReference();
  const { api, call, status } = useAuth();
  const [subspecialty, setSubspecialty] = useState('');
  const [level, setLevel] = useState<EducationLevel | ''>('');
  /** Questions already asked in this visit; a change of filters starts again. */
  const [seen, setSeen] = useState<string[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [state, setState] = useState<'loading' | 'asking' | 'answered' | 'none' | 'done'>(
    'loading',
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [visit, setVisit] = useState({ answered: 0, correct: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** Increases to ask for the next question. */
  const [turn, setTurn] = useState(0);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Wait for the session to be restored, so members get their questions on the first request.
    if (status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/exam-questions/next', {
        params: {
          query: {
            locale,
            ...(subspecialty ? { subspecialty } : {}),
            ...(level ? { level } : {}),
            ...(seen.length ? { exclude: seen.join(',') } : {}),
          },
        },
      }),
    )
      .then((next) => {
        if (!active) return;
        setQuestion(next.question);
        setChosen(null);
        setResult(null);
        setError(null);
        setState(next.question ? 'asking' : seen.length ? 'done' : 'none');
        // After the first question, moving on takes the reader to the new question.
        if (next.question && seen.length) questionRef.current?.focus();
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
    // `seen` is read when a new question is asked for (`turn`), not on every change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, call, status, locale, subspecialty, level, turn]);

  function restart(change: () => void) {
    change();
    setSeen([]);
    setState('loading');
    setTurn((value) => value + 1);
  }

  async function check(event: FormEvent) {
    event.preventDefault();
    if (!question || chosen === null) return;
    setPending(true);
    setError(null);
    try {
      const answer = await call(() =>
        api.POST('/api/v1/exam-questions/{id}/answer', {
          params: { path: { id: question.id } },
          body: { position: chosen, locale },
        }),
      );
      setResult(answer);
      setState('answered');
      setSeen((current) => [...current, question.id]);
      setVisit((current) => ({
        answered: current.answered + 1,
        correct: current.correct + (answer.correct ? 1 : 0),
      }));
      // The outcome is announced and becomes the place the reader continues from.
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const dir = question?.locale === 'he' ? 'rtl' : 'ltr';

  return (
    <PageFrame>
      <div>
        <Link href="/education" className={link}>
          {t('education.item.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{e('title')}</h1>
        <p className="mt-2 text-text-muted">{e('intro')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={e('subspecialty')}
          placeholder={e('allSubspecialties')}
          value={subspecialty}
          onChange={(event) => restart(() => setSubspecialty(event.target.value))}
          options={(reference?.subspecialties ?? []).map((s) => ({
            value: s.key,
            label: name(s),
          }))}
        />
        <SelectField
          label={e('level')}
          placeholder={e('allLevels')}
          value={level}
          onChange={(event) => restart(() => setLevel(event.target.value as EducationLevel | ''))}
          options={EDUCATION_LEVELS.map((value) => ({
            value,
            label: t(`education.levels.${value}`),
          }))}
        />
      </div>

      {visit.answered > 0 && (
        <p className="text-sm text-text-muted" data-testid="exam-score">
          {e('score', visit)}
          {status === 'signedIn' && (
            <>
              {' · '}
              <Link href="/account/exam-results" className={link}>
                {e('results')}
              </Link>
            </>
          )}
        </p>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {state === 'loading' && error === null && (
        <p role="status">{t('membership.common.loading')}</p>
      )}
      {state === 'none' && <p className="text-text-muted">{e('none')}</p>}
      {state === 'done' && (
        <div className="flex flex-col items-start gap-3">
          <Alert>{e('noMore')}</Alert>
          <Button type="button" variant="secondary" onClick={() => restart(() => undefined)}>
            {e('startOver')}
          </Button>
        </div>
      )}

      {question && (state === 'asking' || state === 'answered') && (
        <section
          aria-labelledby="exam-question-title"
          className="rounded-lg border border-border bg-surface p-5"
          data-testid="exam-question"
        >
          <h2
            id="exam-question-title"
            ref={questionRef}
            tabIndex={-1}
            className="text-sm font-semibold text-text-muted focus:outline-none"
          >
            {e('question')}
            {question.subspecialty && ` · ${name(question.subspecialty)}`}
            {` · ${t(`education.levels.${question.level ?? 'all'}`)}`}
          </h2>

          {state === 'asking' && (
            <form onSubmit={check} noValidate className="mt-3 flex flex-col gap-4">
              <fieldset className="flex flex-col gap-3" lang={question.locale} dir={dir}>
                <legend className="mb-3 text-lg font-semibold leading-relaxed">
                  {question.stem}
                </legend>
                <p className="sr-only">{e('choose')}</p>
                {question.options.map((option) => (
                  <label
                    key={option.position}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                      chosen === option.position ? 'border-primary bg-brand-50' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exam-option"
                      className="mt-1 size-4"
                      checked={chosen === option.position}
                      onChange={() => setChosen(option.position)}
                    />
                    <span>{option.text}</span>
                  </label>
                ))}
              </fieldset>
              <div>
                <Button type="submit" pending={pending} disabled={chosen === null}>
                  {e('check')}
                </Button>
              </div>
            </form>
          )}

          {state === 'answered' && result && (
            <div className="mt-3 flex flex-col gap-5" data-testid="exam-result">
              <p className="text-lg font-semibold leading-relaxed" lang={question.locale} dir={dir}>
                {question.stem}
              </p>
              <h3
                ref={resultRef}
                tabIndex={-1}
                className={`rounded-md border px-4 py-3 font-semibold focus:outline-none ${
                  result.correct
                    ? 'border-success-700/30 bg-success-100 text-success-700'
                    : 'border-danger-700/30 bg-danger-100 text-danger-700'
                }`}
              >
                {result.correct ? e('right') : e('wrong')}
              </h3>

              <ul className="flex flex-col gap-3" lang={question.locale} dir={dir}>
                {result.options.map((option) => (
                  <li
                    key={option.position}
                    className={`rounded-md border p-4 ${
                      option.correct ? 'border-success-700' : 'border-border'
                    }`}
                  >
                    <p className="font-semibold">{option.text}</p>
                    <p className="mt-1 flex flex-wrap gap-2">
                      {option.correct && (
                        <span className={`${badge} bg-success-100 text-success-700`}>
                          {e('rightAnswer')}
                        </span>
                      )}
                      {option.position === result.chosenPosition && (
                        <span className={`${badge} bg-surface-muted text-text`}>
                          {e('yourAnswer')}
                        </span>
                      )}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-text-muted">
                      {option.correct ? e('whyRight') : e('whyWrong')}
                    </p>
                    <p className="whitespace-pre-line">{option.explanation}</p>
                  </li>
                ))}
              </ul>

              <div className="rounded-md bg-surface-muted p-4" lang={question.locale} dir={dir}>
                <h3 className="font-semibold">{e('summary')}</h3>
                <p className="mt-1 whitespace-pre-line">{result.summary}</p>
              </div>

              <p className="text-sm text-text-muted">
                {!result.saved
                  ? e('signInNote')
                  : result.countsForScore
                    ? e('savedNote')
                    : e('repeatNote')}
              </p>
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    setState('loading');
                    setTurn((value) => value + 1);
                  }}
                >
                  {e('next')}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </PageFrame>
  );
}
