'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useLocalName, useReference } from '@/features/membership/reference';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { AnswerReview } from './answer-review';
import { EDUCATION_LEVELS, type EducationLevel } from './education-list';

type Schemas = components['schemas'];
type Exam = Schemas['MockExamDto'];
type ExamList = Schemas['MockExamListDto'];
type Size = Schemas['MockExamStartDto']['size'];

const SIZES: Size[] = [10, 25, 50];
const link = 'font-semibold text-primary underline underline-offset-4';

/** Minutes and seconds, as a clock shows them. */
export function clock(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Choosing a mock exam, and the person's earlier ones (M23 plan §2). */
export function MockExamStart() {
  return <RequireSignIn>{() => <StartView />}</RequireSignIn>;
}

function StartView() {
  const t = useTranslations();
  const m = (key: string, values?: Record<string, string | number>) =>
    t(`education.mock.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const name = useLocalName();
  const reference = useReference();
  const router = useRouter();
  const { api, call } = useAuth();
  const sizeGroup = useId();
  const [size, setSize] = useState<Size>(10);
  const [topics, setTopics] = useState<string[]>([]);
  const [level, setLevel] = useState<EducationLevel | ''>('');
  const [list, setList] = useState<ExamList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/mock-exams'))
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const exam = await call(() =>
        api.POST('/api/v1/me/mock-exams', {
          params: { query: { locale } },
          body: { size, subspecialties: topics, ...(level ? { level } : {}) },
        }),
      );
      router.push(`/education/exam/mock/${exam.id}`);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <PageFrame>
      <div>
        <Link href="/education/exam" className={link}>
          {m('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{m('title')}</h1>
        <p className="mt-2 text-text-muted">{m('intro')}</p>
      </div>

      <form onSubmit={start} noValidate className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{m('size')}</legend>
          <div className="flex flex-wrap gap-4">
            {SIZES.map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={sizeGroup}
                  className="size-4"
                  checked={size === value}
                  onChange={() => setSize(value)}
                />
                {m('sizeOption', { count: value, minutes: (value * 90) / 60 })}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{m('topics')}</legend>
          <p className="text-sm text-text-muted">{m('topicsHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(reference?.subspecialties ?? []).map((s) => (
              <label key={s.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={topics.includes(s.key)}
                  onChange={(event) =>
                    setTopics((current) =>
                      event.target.checked
                        ? [...current, s.key]
                        : current.filter((key) => key !== s.key),
                    )
                  }
                />
                {name(s)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="max-w-sm">
          <SelectField
            label={t('education.exam.level')}
            placeholder={t('education.exam.allLevels')}
            value={level}
            onChange={(event) => setLevel(event.target.value as EducationLevel | '')}
            options={EDUCATION_LEVELS.map((value) => ({
              value,
              label: t(`education.levels.${value}`),
            }))}
          />
        </div>
        <p className="text-sm text-text-muted">{m('rules')}</p>
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        <div>
          <Button type="submit" pending={pending}>
            {m('start')}
          </Button>
        </div>
      </form>

      <section aria-labelledby="mock-exams-title" className="flex flex-col gap-3">
        <h2 id="mock-exams-title" className="text-xl font-semibold">
          {m('earlier')}
        </h2>
        {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
        {list && list.items.length === 0 && <p className="text-text-muted">{m('none')}</p>}
        {list && list.items.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="mock-exams">
            {list.items.map((exam) => (
              <li key={exam.id}>
                <Link href={`/education/exam/mock/${exam.id}`} className={link}>
                  {format.dateTime(new Date(exam.startedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Link>
                {' · '}
                {exam.status === 'RUNNING'
                  ? m('running')
                  : m('scored', {
                      correct: exam.correct ?? 0,
                      total: exam.total,
                      percent: Math.round(((exam.correct ?? 0) / exam.total) * 100),
                    })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageFrame>
  );
}

/** Sitting a mock exam, and its review once it is over. */
export function MockExamSitting({ id }: { id: string }) {
  return <RequireSignIn>{() => <SittingView id={id} />}</RequireSignIn>;
}

function SittingView({ id }: { id: string }) {
  const t = useTranslations();
  const m = (key: string, values?: Record<string, string | number>) =>
    t(`education.mock.${key}`, values);
  const locale = useLocale() as 'he' | 'en';
  const { api, call } = useAuth();
  const [exam, setExam] = useState<Exam | null>(null);
  /** The server's clock minus this one's, so the countdown follows the server. */
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [warning, setWarning] = useState('');
  const warned = useRef(new Set<number>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    (work: () => Promise<Exam>) =>
      work()
        .then((result) => {
          const clientNow = Date.now();
          setExam(result);
          setNow(clientNow);
          setOffset(Date.parse(result.now) - clientNow);
          if (result.status === 'FINISHED') {
            requestAnimationFrame(() => resultRef.current?.focus());
          }
        })
        .catch((caught: unknown) => setError(caught)),
    [],
  );

  useEffect(() => {
    void load(() =>
      call(() =>
        api.GET('/api/v1/me/mock-exams/{id}', {
          params: { path: { id }, query: { locale } },
        }),
      ),
    );
  }, [api, call, id, locale, load]);

  const running = exam?.status === 'RUNNING';
  const left = exam ? Date.parse(exam.endsAt) - (now + offset) : 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    // Said once each, politely: five minutes and one minute before the end.
    for (const minutes of [5, 1]) {
      if (left <= minutes * 60_000 && left > 0 && !warned.current.has(minutes)) {
        warned.current.add(minutes);
        setWarning(m('minutesLeft', { count: minutes }));
      }
    }
    if (left <= 0) {
      // The server closes it; reading it again shows the review.
      void load(() =>
        call(() =>
          api.GET('/api/v1/me/mock-exams/{id}', {
            params: { path: { id }, query: { locale } },
          }),
        ),
      );
    }
    // m is a fresh function each render; the warning depends on the time left only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, left <= 0, Math.ceil(left / 60_000)]);

  async function choose(position: number, option: number) {
    if (!exam) return;
    const before = exam;
    setExam({
      ...exam,
      questions: exam.questions.map((q) =>
        q.position === position ? { ...q, chosenPosition: option } : q,
      ),
      answered: exam.answered + (exam.questions[position - 1]?.chosenPosition === null ? 1 : 0),
    });
    setError(null);
    try {
      await call(() =>
        api.PUT('/api/v1/me/mock-exams/{id}/answers/{position}', {
          params: { path: { id, position } },
          body: { position: option },
        }),
      );
    } catch (caught) {
      setExam(before);
      setError(caught);
    }
  }

  async function finish() {
    setPending(true);
    setConfirming(false);
    await load(() =>
      call(() =>
        api.POST('/api/v1/me/mock-exams/{id}/finish', {
          params: { path: { id }, query: { locale } },
        }),
      ),
    );
    setPending(false);
  }

  function go(position: number) {
    setCurrent(position);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  if (!exam) {
    return (
      <PageFrame>
        {error !== null ? (
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        ) : (
          <p role="status">{t('membership.common.loading')}</p>
        )}
      </PageFrame>
    );
  }

  if (exam.status === 'FINISHED') {
    const percent = Math.round(((exam.correct ?? 0) / exam.total) * 100);
    return (
      <PageFrame>
        <div>
          <Link href="/education/exam/mock" className={link}>
            {m('backToExams')}
          </Link>
          <h1
            ref={resultRef}
            tabIndex={-1}
            className="mt-3 text-3xl font-semibold text-brand-900 focus:outline-none"
          >
            {m('resultTitle')}
          </h1>
          <p className="mt-2 text-xl font-semibold" data-testid="mock-score">
            {m('scored', { correct: exam.correct ?? 0, total: exam.total, percent })}
          </p>
          <p className="mt-1 text-text-muted">
            {m('unanswered', { count: exam.total - exam.answered })}
          </p>
        </div>
        <ol className="flex flex-col gap-6" data-testid="mock-review">
          {exam.questions.map((question) => {
            const right = question.chosenPosition === question.correctPosition;
            return (
              <li
                key={question.position}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
              >
                <h2 className="text-sm font-semibold text-text-muted">
                  {m('questionOf', { number: question.position, total: exam.total })}
                  {' · '}
                  {question.chosenPosition === null
                    ? m('notAnswered')
                    : right
                      ? t('education.exam.right')
                      : t('education.exam.wrong')}
                </h2>
                <p className="text-lg font-semibold leading-relaxed" lang={locale}>
                  {question.stem}
                </p>
                <AnswerReview
                  options={question.options}
                  chosenPosition={question.chosenPosition}
                  summary={question.summary}
                  references={question.references}
                  reviewer={question.reviewer}
                  lang={locale}
                />
              </li>
            );
          })}
        </ol>
        <Link href="/education/exam/mock" className={link}>
          {m('again')}
        </Link>
      </PageFrame>
    );
  }

  const question = exam.questions[current - 1]!;
  const unanswered = exam.total - exam.answered;

  return (
    <PageFrame>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold text-brand-900">{m('title')}</h1>
        <p className="text-xl font-semibold tabular-nums" data-testid="mock-clock">
          <span className="sr-only">{m('timeLeft')} </span>
          <span aria-hidden="true">⏱ </span>
          {clock(left)}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {warning}
      </p>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}

      <nav aria-label={m('questions')}>
        <ol className="flex flex-wrap gap-2">
          {exam.questions.map((q) => (
            <li key={q.position}>
              <button
                type="button"
                onClick={() => go(q.position)}
                aria-current={q.position === current ? 'step' : undefined}
                aria-label={m(q.chosenPosition === null ? 'goTo' : 'goToAnswered', {
                  number: q.position,
                })}
                className={`size-10 rounded-md border text-sm font-semibold ${
                  q.position === current
                    ? 'border-primary bg-primary text-on-primary'
                    : q.chosenPosition !== null
                      ? 'border-primary bg-brand-50 text-text'
                      : 'border-border text-text'
                }`}
              >
                {q.position}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section
        aria-labelledby="mock-question-title"
        className="rounded-lg border border-border bg-surface p-5"
        data-testid="mock-question"
      >
        <h2
          id="mock-question-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-text-muted focus:outline-none"
        >
          {m('questionOf', { number: current, total: exam.total })}
        </h2>
        <fieldset className="mt-3 flex flex-col gap-3" lang={locale}>
          <legend className="mb-3 text-lg font-semibold leading-relaxed">{question.stem}</legend>
          {question.options.map((option) => (
            <label
              key={option.position}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                question.chosenPosition === option.position
                  ? 'border-primary bg-brand-50'
                  : 'border-border'
              }`}
            >
              <input
                type="radio"
                name={`mock-${question.position}`}
                className="mt-1 size-4"
                checked={question.chosenPosition === option.position}
                onChange={() => void choose(question.position, option.position)}
              />
              <span>{option.text}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-5 flex flex-wrap gap-3">
          {current > 1 && (
            <Button type="button" variant="secondary" onClick={() => go(current - 1)}>
              {m('previous')}
            </Button>
          )}
          {current < exam.total && (
            <Button type="button" onClick={() => go(current + 1)}>
              {m('next')}
            </Button>
          )}
        </div>
      </section>

      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-muted">
          {m('progress', { answered: exam.answered, total: exam.total })}
        </p>
        {confirming ? (
          <Alert tone="warning">
            <p>{unanswered > 0 ? m('confirmUnanswered', { count: unanswered }) : m('confirm')}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="button" pending={pending} onClick={() => void finish()}>
                {m('finishNow')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                {m('keepGoing')}
              </Button>
            </div>
          </Alert>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            {m('finish')}
          </Button>
        )}
      </div>
    </PageFrame>
  );
}
