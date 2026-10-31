'use client';

import {
  type ConferenceEvent,
  type LivePoll,
  type LiveQuestion,
  type LiveSession as Live,
  questionsInOrder,
  votePercent,
} from '@medconnect/api-client/conference';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { QrCode } from '@/features/membership/qr-code';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { useConferenceEvents } from './conference-events';

const link = 'font-semibold text-primary underline underline-offset-4';
const card = 'flex flex-col gap-3 rounded-md border border-border p-4';
/** Codes live 5 minutes; fetch a new one well before that. */
const CODE_REFRESH_MS = 4 * 60 * 1000;

/** A session's live part: its polls, questions and feedback, and the chair's controls (M32). */
export function LiveSessionPage({ slug, sessionId }: { slug: string; sessionId: string }) {
  return (
    <RequireSignIn>{() => <LiveSessionView slug={slug} sessionId={sessionId} />}</RequireSignIn>
  );
}

function LiveSessionView({ slug, sessionId }: { slug: string; sessionId: string }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [live, setLive] = useState<Live | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState(true);
  const [bigScreen, setBigScreen] = useState(false);
  const path = { slug, sessionId };

  const load = useCallback(() => {
    call(() => api.GET('/api/v1/events/{slug}/sessions/{sessionId}/live', { params: { path } }))
      .then((result) => {
        setLive(result);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught));
    // `path` is made of these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, call, slug, sessionId]);

  useEffect(load, [load]);

  useEffect(() => {
    call(() => api.GET('/api/v1/events/{slug}/sessions', { params: { path: { slug } } }))
      .then((result) => {
        setTitle(result.items.find((item) => item.id === sessionId)?.title ?? null);
      })
      .catch(() => undefined);
  }, [api, call, slug, sessionId]);

  const onEvent = useCallback(
    (event: ConferenceEvent) => {
      if ('sessionId' in event && event.sessionId !== sessionId) return;
      load();
    },
    [load, sessionId],
  );
  useConferenceEvents(slug, onEvent, setConnected);

  if (!live) {
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

  if (bigScreen) {
    return <BigScreen live={live} title={title} onClose={() => setBigScreen(false)} />;
  }

  return (
    <PageFrame>
      <Link href={`/events/${encodeURIComponent(slug)}`} className={link}>
        {t('events.live.backToEvent')}
      </Link>
      <h1 className="text-3xl font-semibold text-brand-900">{title ?? t('events.live.title')}</h1>
      {!connected && <Alert tone="warning">{t('events.live.notLive')}</Alert>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {live.canChair && (
        <Button variant="secondary" onClick={() => setBigScreen(true)}>
          {t('events.live.bigScreen')}
        </Button>
      )}
      <Polls slug={slug} sessionId={sessionId} live={live} onChange={load} />
      <Questions slug={slug} sessionId={sessionId} live={live} onChange={load} />
      <Feedback slug={slug} sessionId={sessionId} live={live} onChange={load} />
      {live.canChair && (
        <ChairPanel slug={slug} sessionId={sessionId} live={live} onChange={load} />
      )}
    </PageFrame>
  );
}

interface PartProps {
  slug: string;
  sessionId: string;
  live: Live;
  onChange: () => void;
}

function useAction(onChange: () => void) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        await action();
        onChange();
        return true;
      } catch (caught) {
        setError(caught);
        return false;
      } finally {
        setPending(false);
      }
    },
    [onChange],
  );
  const problem = error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>;
  return { pending, run, problem };
}

function Results({ poll }: { poll: LivePoll }) {
  const t = useTranslations('events.live');
  return (
    <ul className="flex flex-col gap-2" data-testid="poll-results">
      {poll.options.map((option) => {
        const percent = votePercent(option.votes, poll.total);
        return (
          <li key={option.id} className="flex flex-col gap-1">
            <span className="flex justify-between gap-2">
              <span>{option.text}</span>
              <span className="font-semibold">{t('percent', { percent })}</span>
            </span>
            <span className="block h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
              <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
            </span>
          </li>
        );
      })}
      <li className="text-sm text-text-muted">{t('votes', { count: poll.total ?? 0 })}</li>
    </ul>
  );
}

function Polls({ slug, sessionId, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const { api, call } = useAuth();
  const { pending, run, problem } = useAction(onChange);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const path = { slug, sessionId };

  const vote = (pollId: string) =>
    run(() =>
      call(() =>
        api.POST('/api/v1/events/{slug}/sessions/{sessionId}/polls/{pollId}/vote', {
          params: { path: { ...path, pollId } },
          body: { optionId: choice[pollId]! },
        }),
      ),
    );
  const setStatus = (pollId: string, to: 'open' | 'close') =>
    run(() =>
      call(() =>
        to === 'open'
          ? api.POST('/api/v1/events/{slug}/sessions/{sessionId}/chair/polls/{pollId}/open', {
              params: { path: { ...path, pollId } },
            })
          : api.POST('/api/v1/events/{slug}/sessions/{sessionId}/chair/polls/{pollId}/close', {
              params: { path: { ...path, pollId } },
            }),
      ),
    );
  const remove = (pollId: string) =>
    run(() =>
      call(() =>
        api.DELETE('/api/v1/events/{slug}/sessions/{sessionId}/chair/polls/{pollId}', {
          params: { path: { ...path, pollId } },
        }),
      ),
    );

  return (
    <section aria-labelledby="polls-title" className="flex flex-col gap-3">
      <h2 id="polls-title" className="text-xl font-semibold">
        {t('polls')}
      </h2>
      {problem}
      {live.polls.length === 0 && <p className="text-text-muted">{t('noPolls')}</p>}
      {live.polls.map((poll) => (
        <article key={poll.id} className={card} data-testid="poll">
          <p className="font-semibold">{poll.question}</p>
          {poll.status === 'DRAFT' && <p className="text-sm text-text-muted">{t('pollDraft')}</p>}
          {poll.status === 'CLOSED' && <p className="text-sm text-text-muted">{t('pollClosed')}</p>}
          {poll.status === 'OPEN' && !poll.voted ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{poll.question}</legend>
              {poll.options.map((option) => (
                <label key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    className="size-4"
                    name={`poll-${poll.id}`}
                    checked={choice[poll.id] === option.id}
                    onChange={() => setChoice((c) => ({ ...c, [poll.id]: option.id }))}
                  />
                  {option.text}
                </label>
              ))}
              <div>
                <Button onClick={() => void vote(poll.id)} disabled={pending || !choice[poll.id]}>
                  {t('vote')}
                </Button>
              </div>
            </fieldset>
          ) : (
            poll.total !== null && <Results poll={poll} />
          )}
          {poll.status === 'OPEN' && !poll.voted && poll.total !== null && <Results poll={poll} />}
          {poll.voted && <p className="text-sm text-text-muted">{t('voted')}</p>}
          {live.canChair && (
            <div className="flex flex-wrap gap-2">
              {poll.status === 'DRAFT' && (
                <>
                  <Button onClick={() => void setStatus(poll.id, 'open')} disabled={pending}>
                    {t('openPoll')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void remove(poll.id)}
                    disabled={pending}
                  >
                    {t('removePoll')}
                  </Button>
                </>
              )}
              {poll.status === 'OPEN' && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(poll.id, 'close')}
                  disabled={pending}
                >
                  {t('closePoll')}
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
      <p className="text-sm text-text-muted">{t('votesAnonymous')}</p>
    </section>
  );
}

function Asker({ question }: { question: LiveQuestion }) {
  const t = useTranslations('events.live');
  if (question.authorName) return <>{question.authorName}</>;
  if (question.guestNumber !== null) return <>{t('guestName', { number: question.guestNumber })}</>;
  return <>{t('anonymous')}</>;
}

function Questions({ slug, sessionId, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const { api, call } = useAuth();
  const { pending, run, problem } = useAction(onChange);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sent, setSent] = useState(false);
  const path = { slug, sessionId };

  async function ask(event: FormEvent) {
    event.preventDefault();
    setSent(false);
    const done = await run(() =>
      call(() =>
        api.POST('/api/v1/events/{slug}/sessions/{sessionId}/questions', {
          params: { path },
          body: { text, anonymous },
        }),
      ),
    );
    if (done) {
      setText('');
      setSent(true);
    }
  }
  const upvote = (question: LiveQuestion) =>
    run(() =>
      call(() =>
        question.upvoted
          ? api.DELETE('/api/v1/events/{slug}/sessions/{sessionId}/questions/{questionId}/upvote', {
              params: { path: { ...path, questionId: question.id } },
            })
          : api.PUT('/api/v1/events/{slug}/sessions/{sessionId}/questions/{questionId}/upvote', {
              params: { path: { ...path, questionId: question.id } },
            }),
      ),
    );
  const setStatus = (questionId: string, status: 'VISIBLE' | 'ANSWERED' | 'HIDDEN') =>
    run(() =>
      call(() =>
        api.PUT('/api/v1/events/{slug}/sessions/{sessionId}/chair/questions/{questionId}/status', {
          params: { path: { ...path, questionId } },
          body: { status },
        }),
      ),
    );

  return (
    <section aria-labelledby="questions-title" className="flex flex-col gap-3">
      <h2 id="questions-title" className="text-xl font-semibold">
        {t('questions')}
      </h2>
      {problem}
      {live.questionsOpen ? (
        <form className={card} onSubmit={(event) => void ask(event)}>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">{t('askLabel')}</span>
            <textarea
              className="rounded-md border border-border bg-surface p-2"
              rows={3}
              maxLength={500}
              required
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p className="text-sm text-text-muted">{t('noPatients')}</p>
          {live.allowAnonymousQuestions && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
              />
              {t('askAnonymously')}
            </label>
          )}
          <div>
            <Button type="submit" disabled={pending || !text.trim()}>
              {t('ask')}
            </Button>
          </div>
          {sent && (
            <p role="status" className="text-sm">
              {live.moderateQuestions ? t('sentForModeration') : t('sent')}
            </p>
          )}
        </form>
      ) : (
        <p className="text-text-muted">{t('questionsClosed')}</p>
      )}
      {live.questions.length === 0 && <p className="text-text-muted">{t('noQuestions')}</p>}
      <ul className="flex flex-col gap-3" data-testid="questions">
        {questionsInOrder(live.questions).map((question) => (
          <li key={question.id} className={card}>
            <p className="whitespace-pre-line">{question.text}</p>
            <p className="text-sm text-text-muted">
              <Asker question={question} />
              {question.status !== 'VISIBLE' && ` · ${t(`status.${question.status}`)}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {(question.status === 'VISIBLE' || question.status === 'ANSWERED') && (
                <Button
                  variant="secondary"
                  aria-pressed={question.upvoted}
                  onClick={() => void upvote(question)}
                  disabled={pending}
                >
                  {t('upvote', { count: question.upvotes })}
                </Button>
              )}
              {live.canModerate && question.status !== 'VISIBLE' && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(question.id, 'VISIBLE')}
                  disabled={pending}
                >
                  {t('letThrough')}
                </Button>
              )}
              {live.canModerate && question.status === 'VISIBLE' && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(question.id, 'ANSWERED')}
                  disabled={pending}
                >
                  {t('markAnswered')}
                </Button>
              )}
              {live.canModerate && question.status !== 'HIDDEN' && (
                <Button
                  variant="secondary"
                  onClick={() => void setStatus(question.id, 'HIDDEN')}
                  disabled={pending}
                >
                  {t('hide')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feedback({ slug, sessionId, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const { api, call } = useAuth();
  const { pending, run, problem } = useAction(onChange);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!rating) return;
    await run(() =>
      call(() =>
        api.POST('/api/v1/events/{slug}/sessions/{sessionId}/feedback', {
          params: { path: { slug, sessionId } },
          body: { rating, ...(comment.trim() ? { comment } : {}) },
        }),
      ),
    );
  }

  if (!live.feedbackOpen && !live.feedbackGiven) return null;
  return (
    <section aria-labelledby="feedback-title" className="flex flex-col gap-3">
      <h2 id="feedback-title" className="text-xl font-semibold">
        {t('feedback')}
      </h2>
      {problem}
      {live.feedbackGiven ? (
        <Alert tone="success">{t('feedbackThanks')}</Alert>
      ) : (
        <form className={card} onSubmit={(event) => void send(event)}>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 font-semibold">{t('rating')}</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center gap-1">
                <input
                  type="radio"
                  className="size-4"
                  name="rating"
                  checked={rating === value}
                  onChange={() => setRating(value)}
                />
                {value}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1">
            <span>{t('comment')}</span>
            <textarea
              className="rounded-md border border-border bg-surface p-2"
              rows={2}
              maxLength={1000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="text-sm text-text-muted">{t('feedbackAnonymous')}</p>
          <div>
            <Button type="submit" disabled={pending || !rating}>
              {t('sendFeedback')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ChairPanel({ slug, sessionId, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const { api, call, me } = useAuth();
  const { pending, run, problem } = useAction(onChange);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    count: number;
    average: number | null;
    comments: string[];
  } | null>(null);
  const path = { slug, sessionId };
  const locale = me?.locale ?? 'he';

  useEffect(() => {
    if (!showCode) return;
    let active = true;
    const load = () =>
      call(() =>
        api.GET('/api/v1/events/{slug}/sessions/{sessionId}/chair/attendance-code', {
          params: { path, query: { locale } },
        }),
      )
        .then((result) => active && setCode(result.url))
        .catch(() => active && setCode(null));
    void load();
    const timer = window.setInterval(() => void load(), CODE_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, call, showCode, slug, sessionId, locale]);

  async function createPoll(event: FormEvent) {
    event.preventDefault();
    const done = await run(() =>
      call(() =>
        api.POST('/api/v1/events/{slug}/sessions/{sessionId}/chair/polls', {
          params: { path },
          body: { question, options: options.filter((option) => option.trim()) },
        }),
      ),
    );
    if (done) {
      setQuestion('');
      setOptions(['', '']);
    }
  }
  const setting = (body: { moderateQuestions?: boolean; allowAnonymousQuestions?: boolean }) =>
    run(() =>
      call(() =>
        api.PATCH('/api/v1/events/{slug}/sessions/{sessionId}/chair/settings', {
          params: { path },
          body,
        }),
      ),
    );
  const loadSummary = () =>
    run(async () =>
      setSummary(
        await call(() =>
          api.GET('/api/v1/events/{slug}/sessions/{sessionId}/chair/feedback', {
            params: { path },
          }),
        ),
      ),
    );

  return (
    <section
      aria-labelledby="chair-title"
      className="flex flex-col gap-4 rounded-md border border-border p-4"
    >
      <h2 id="chair-title" className="text-xl font-semibold">
        {t('chairTitle')}
      </h2>
      {problem}
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={live.moderateQuestions}
            disabled={pending}
            onChange={(event) => void setting({ moderateQuestions: event.target.checked })}
          />
          {t('moderateFirst')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={live.allowAnonymousQuestions}
            disabled={pending}
            onChange={(event) => void setting({ allowAnonymousQuestions: event.target.checked })}
          />
          {t('allowAnonymous')}
        </label>
      </div>

      <form className="flex flex-col gap-2" onSubmit={(event) => void createPoll(event)}>
        <h3 className="font-semibold">{t('newPoll')}</h3>
        <label className="flex flex-col gap-1">
          <span>{t('pollQuestion')}</span>
          <input
            className="rounded-md border border-border bg-surface p-2"
            maxLength={500}
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        {options.map((option, index) => (
          <label key={index} className="flex flex-col gap-1">
            <span>{t('pollOption', { number: index + 1 })}</span>
            <input
              className="rounded-md border border-border bg-surface p-2"
              maxLength={200}
              value={option}
              onChange={(event) =>
                setOptions((list) =>
                  list.map((item, at) => (at === index ? event.target.value : item)),
                )
              }
            />
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          {options.length < 8 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOptions((list) => [...list, ''])}
            >
              {t('addOption')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={pending || options.filter((option) => option.trim()).length < 2}
          >
            {t('savePoll')}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('attendanceTitle')}</h3>
        <div>
          <Button variant="secondary" onClick={() => setShowCode((shown) => !shown)}>
            {showCode ? t('hideCode') : t('showCode')}
          </Button>
        </div>
        {showCode && code && <QrCode value={code} label={t('attendanceTitle')} size={280} />}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('feedbackSummary')}</h3>
        <div>
          <Button variant="secondary" onClick={() => void loadSummary()} disabled={pending}>
            {t('readFeedback')}
          </Button>
        </div>
        {summary && (
          <>
            <p>
              {summary.average === null
                ? t('noFeedback')
                : t('feedbackResult', { average: summary.average, count: summary.count })}
            </p>
            <ul className="list-disc ps-5">
              {summary.comments.map((comment, index) => (
                <li key={index}>{comment}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

/** For a projector or a phone held up: the poll that is open, and the top questions, large. */
function BigScreen({
  live,
  title,
  onClose,
}: {
  live: Live;
  title: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('events.live');
  const poll =
    live.polls.find((item) => item.status === 'OPEN') ??
    live.polls.find((item) => item.status === 'CLOSED');
  const questions = questionsInOrder(live.questions)
    .filter((question) => question.status === 'VISIBLE')
    .slice(0, 5);
  return (
    <main className="flex min-h-screen flex-col gap-8 bg-surface p-8 text-2xl" data-testid="big">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-4xl font-semibold text-brand-900">{title}</h1>
        <Button variant="secondary" onClick={onClose}>
          {t('closeBigScreen')}
        </Button>
      </div>
      {poll && (
        <section className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold">{poll.question}</h2>
          <Results poll={poll} />
        </section>
      )}
      {questions.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold">{t('questions')}</h2>
          <ul className="flex flex-col gap-3">
            {questions.map((question) => (
              <li key={question.id}>
                {question.text}{' '}
                <span className="text-text-muted">
                  {t('upvoteCount', { count: question.upvotes })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
