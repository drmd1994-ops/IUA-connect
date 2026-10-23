'use client';

import type { components, paths } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { AnswerReview } from './answer-review';
import { EDUCATION_LEVELS, type EducationLevel } from './education-list';

type Schemas = components['schemas'];
type Question = NonNullable<Schemas['NextQuestionDto']['question']>;
type Result = Schemas['AnswerResultDto'];
type PracticeSet = NonNullable<NonNullable<NextQuery>['set']>;
type NextQuery = NonNullable<paths['/api/v1/exam-questions/next']['get']['parameters']['query']>;
type ReportReason = Schemas['ExamReportInputDto']['reason'];

const SETS: PracticeSet[] = ['all', 'bookmarks', 'wrong'];
const REPORT_REASONS: ReportReason[] = ['WRONG_ANSWER', 'UNCLEAR', 'OUTDATED', 'TYPO', 'OTHER'];

const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * Exam practice (M6 plan §2.10), in the layout the owner asked for: one multiple-choice question;
 * after the reader answers, the right answer, why each option is right or wrong, and a short
 * summary of the topic. The answer and the explanations arrive only in the reply to an answer.
 * A signed-in reader (M23) practises all questions, leaving out those answered right in the last
 * 30 days, or their bookmarks, or the ones they got wrong; bookmarks a question; and reports one.
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
  const [practiceSet, setPracticeSet] = useState<PracticeSet>('all');
  const [leftOut, setLeftOut] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
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
            ...(status === 'signedIn' && practiceSet !== 'all' ? { set: practiceSet } : {}),
            ...(seen.length ? { exclude: seen.join(',') } : {}),
          },
        },
      }),
    )
      .then((next) => {
        if (!active) return;
        setQuestion(next.question);
        setLeftOut(next.leftOutRecentlyRight);
        setBookmarked(next.question?.bookmarked ?? false);
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
  }, [api, call, status, locale, subspecialty, level, practiceSet, turn]);

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
      setBookmarked(answer.bookmarked);
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

  async function toggleBookmark() {
    if (!question) return;
    const next = !bookmarked;
    setBookmarked(next);
    try {
      await call(() =>
        next
          ? api.PUT('/api/v1/me/exam-bookmarks/{questionId}', {
              params: { path: { questionId: question.id } },
            })
          : api.DELETE('/api/v1/me/exam-bookmarks/{questionId}', {
              params: { path: { questionId: question.id } },
            }),
      );
    } catch (caught) {
      setBookmarked(!next);
      setError(caught);
    }
  }

  const dir = question?.locale === 'he' ? 'rtl' : 'ltr';
  const signedIn = status === 'signedIn';

  return (
    <PageFrame>
      <div>
        <Link href="/education" className={link}>
          {t('education.item.back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{e('title')}</h1>
        <p className="mt-2 text-text-muted">{e('intro')}</p>
        {signedIn && (
          <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/education/exam/mock" className={link}>
              {e('mockLink')}
            </Link>
            <Link href="/account/exam-results" className={link}>
              {e('progressLink')}
            </Link>
          </p>
        )}
      </div>

      <div className={`grid gap-4 ${signedIn ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
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
        {signedIn && (
          <SelectField
            label={e('set')}
            value={practiceSet}
            onChange={(event) => restart(() => setPracticeSet(event.target.value as PracticeSet))}
            options={SETS.map((value) => ({ value, label: e(`sets.${value}`) }))}
          />
        )}
      </div>
      {signedIn && practiceSet === 'all' && leftOut > 0 && (
        <p className="text-sm text-text-muted" data-testid="exam-left-out">
          {e('leftOut', { count: leftOut })}
        </p>
      )}

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
      {state === 'none' && (
        <p className="text-text-muted">
          {practiceSet === 'all' ? e('none') : e(`noneIn.${practiceSet}`)}
        </p>
      )}
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
            {question.difficulty && ` · ${e(`difficulty.${question.difficulty}`)}`}
          </h2>
          {signedIn && (
            <div className="mt-2">
              <Button
                type="button"
                variant="link"
                aria-pressed={bookmarked}
                onClick={() => void toggleBookmark()}
                data-testid="exam-bookmark"
              >
                {bookmarked ? e('bookmarked') : e('bookmark')}
              </Button>
            </div>
          )}

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

              <AnswerReview
                options={result.options}
                chosenPosition={result.chosenPosition}
                summary={result.summary}
                references={result.references}
                reviewer={result.reviewer}
                lang={question.locale}
              />

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
              {signedIn && <ReportQuestion key={question.id} questionId={question.id} />}
            </div>
          )}
        </section>
      )}
    </PageFrame>
  );
}

/** "Something is wrong with this question": goes to the reviewers, who answer (M23). */
function ReportQuestion({ questionId }: { questionId: string }) {
  const t = useTranslations();
  const r = (key: string) => t(`education.exam.report.${key}`);
  const { api, call } = useAuth();
  const groupId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason || (reason === 'OTHER' && !text.trim())) return;
    setPending(true);
    setError(null);
    try {
      await call(() =>
        api.POST('/api/v1/exam-questions/{id}/reports', {
          params: { path: { id: questionId } },
          body: { reason, text: text.trim() },
        }),
      );
      setSent(true);
      setOpen(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div data-testid="exam-report-sent">
        <Alert tone="success">{r('sent')}</Alert>
      </div>
    );
  }
  if (!open) {
    return (
      <div>
        <Button type="button" variant="link" onClick={() => setOpen(true)}>
          {r('open')}
        </Button>
      </div>
    );
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-border p-4"
      data-testid="exam-report"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{r('title')}</legend>
        {REPORT_REASONS.map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name={groupId}
              className="size-4"
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            {r(`reasons.${value}`)}
          </label>
        ))}
      </fieldset>
      <TextareaField
        label={r('text')}
        hint={r('textHint')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={1000}
        rows={3}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          pending={pending}
          disabled={!reason || (reason === 'OTHER' && !text.trim())}
        >
          {r('send')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {r('cancel')}
        </Button>
      </div>
    </form>
  );
}
