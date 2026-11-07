import {
  type ConferenceEvent,
  LIVE_FALLBACK_MS,
  type LivePoll,
  type LiveQuestion,
  type LiveSession,
  askAgainDelay,
  eventRunning,
  nowAndNext,
  parseConferenceEvent,
  questionsInOrder,
  votePercent,
} from '@medconnect/api-client/conference';
import { semantic } from '@medconnect/ui-tokens';
import { fetch as streamingFetch } from 'expo/fetch';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useFormatter, useTranslations } from 'use-intl';
import { encode } from 'uqr';
import { takeBlocks } from '@/chat/model';
import { API_URL } from '@/config';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';

/** Codes live 5 minutes; fetch a new one well before that. */
const CODE_REFRESH_MS = 4 * 60 * 1000;
const NOW_REFRESH_MS = 30_000;
const MAX_RETRY_MS = 15_000;

const asJson = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined
    ? {}
    : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

/**
 * An event's live changes while a screen shows it, as chat does (M32 plan §4). A hall hears a
 * change at once, so each phone acts on it at a random moment. Without the stream it asks again
 * every 15 seconds and says so. In the background the stream is closed.
 */
export function useConferenceEvents(
  slug: string,
  onEvent: (event: ConferenceEvent) => void,
  onLive: (live: boolean) => void,
) {
  const { session } = useSession();
  const handler = useRef(onEvent);
  const liveHandler = useRef(onLive);
  useEffect(() => {
    handler.current = onEvent;
    liveHandler.current = onLive;
  }, [onEvent, onLive]);

  useEffect(() => {
    let controller: AbortController | null = null;
    let stopped = true;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const emit = (event: ConferenceEvent) => {
      setTimeout(() => {
        if (!stopped) handler.current(event);
      }, askAgainDelay());
    };
    const startFallback = () => {
      liveHandler.current(false);
      fallback ??= setInterval(() => handler.current({ type: 'refresh' }), LIVE_FALLBACK_MS);
    };
    const stopFallback = () => {
      liveHandler.current(true);
      clearInterval(fallback);
      fallback = undefined;
    };
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const open = (signal: AbortSignal) =>
      streamingFetch(`${API_URL}/api/v1/events/${encodeURIComponent(slug)}/live/stream`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.accessToken() ?? ''}`,
        },
        signal,
      });

    async function run(signal: AbortSignal) {
      let failures = 0;
      let connectedBefore = false;
      while (!stopped && !signal.aborted) {
        try {
          let response = await open(signal);
          if (response.status === 401) {
            // The token ran out: an ordinary request renews the session, then try once more.
            await session.fetch('/api/v1/me');
            response = await open(signal);
          }
          if (!response.ok || !response.body) throw new Error('stream unavailable');
          stopFallback();
          failures = 0;
          if (connectedBefore) emit({ type: 'refresh' });
          connectedBefore = true;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const { blocks, rest } = takeBlocks(buffer);
            buffer = rest;
            for (const block of blocks) {
              const event = parseConferenceEvent(block);
              if (event && event.type !== 'ping') emit(event);
            }
          }
        } catch {
          if (stopped || signal.aborted) return;
          failures += 1;
          startFallback();
        }
        if (stopped || signal.aborted) return;
        await wait(failures === 0 ? 250 : Math.min(1000 * 2 ** failures, MAX_RETRY_MS));
      }
    }

    const start = () => {
      if (!stopped) return;
      stopped = false;
      controller = new AbortController();
      void run(controller.signal);
    };
    const stop = () => {
      stopped = true;
      clearInterval(fallback);
      fallback = undefined;
      controller?.abort();
      controller = null;
    };
    start();
    const watching = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      watching.remove();
      stop();
    };
  }, [session, slug]);
}

interface Timed {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  room?: string | null;
}

/** While an event runs: my schedule, what is on and what is next, first on its page (M32). */
export function NowAndNext({
  slug,
  event,
  sessions,
  chosen,
}: {
  slug: string;
  event: { startAt: string; endAt: string; timezone: string };
  sessions: readonly Timed[];
  chosen: readonly string[];
}) {
  const t = useTranslations('events.live');
  const format = useFormatter();
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (sessions.length === 0 || !eventRunning(event, now)) return null;
  const { now: on, next } = nowAndNext(sessions, now);
  const mine = sessions.filter(
    (session) => chosen.includes(session.id) && Date.parse(session.endAt) > now.getTime(),
  );
  const time = (iso: string) =>
    format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: event.timezone });
  const line = (session: Timed) => (
    <View key={session.id} style={styles.line}>
      <Text style={styles.small}>
        {`${time(session.startAt)} – ${time(session.endAt)}`}
        {session.room ? ` · ${t('room', { room: session.room })}` : ''}
      </Text>
      <Button
        label={session.title}
        variant="link"
        onPress={() => router.push(`/events/session/${encodeURIComponent(slug)}/${session.id}`)}
      />
    </View>
  );
  return (
    <Card>
      {mine.length > 0 && (
        <>
          <Heading>{t('mySchedule')}</Heading>
          {mine.map(line)}
        </>
      )}
      <Heading>{t('now')}</Heading>
      {on.length === 0 ? <Body muted>{t('nothingNow')}</Body> : on.map(line)}
      {next.length > 0 && (
        <>
          <Heading>{t('next')}</Heading>
          {next.map(line)}
        </>
      )}
    </Card>
  );
}

/** A session's polls, questions and feedback, and what its chair and moderator do (M32). */
export function LiveSessionScreen({ slug, sessionId }: { slug: string; sessionId: string }) {
  const all = useTranslations();
  const t = useTranslations('events.live');
  const locale = useLocale();
  const router = useRouter();
  const { request } = useSession();
  const [live, setLive] = useState<LiveSession | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState(true);
  const base = `/api/v1/events/${encodeURIComponent(slug)}/sessions/${sessionId}`;

  const load = useCallback(() => {
    request<LiveSession>(`${base}/live`)
      .then((result) => {
        setLive(result);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught));
  }, [request, base]);
  useEffect(load, [load]);

  useEffect(() => {
    let active = true;
    request<{ items: { id: string; title: string }[] }>(
      `/api/v1/events/${encodeURIComponent(slug)}/sessions?locale=${locale}`,
    )
      .then((list) => {
        if (active) setTitle(list.items.find((item) => item.id === sessionId)?.title ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, slug, sessionId, locale]);

  const onEvent = useCallback(
    (event: ConferenceEvent) => {
      if ('sessionId' in event && event.sessionId !== sessionId) return;
      load();
    },
    [load, sessionId],
  );
  useConferenceEvents(slug, onEvent, setConnected);

  const back = (
    <Button
      label={t('backToEvent')}
      variant="link"
      onPress={() => router.navigate(`/events/${encodeURIComponent(slug)}`)}
    />
  );
  if (!live) {
    return (
      <Screen>
        {back}
        {error !== null ? (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        ) : (
          <Body muted>{all('mobile.loading')}</Body>
        )}
      </Screen>
    );
  }
  const part = { base, live, onChange: load };
  return (
    <Screen>
      {back}
      <Title>{title ?? t('title')}</Title>
      {!connected && <Notice tone="warning">{t('notLive')}</Notice>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Polls {...part} />
      <Questions {...part} />
      <Feedback {...part} />
      {live.canChair && <ChairPanel {...part} />}
    </Screen>
  );
}

interface PartProps {
  base: string;
  live: LiveSession;
  onChange: () => void;
}

function useAction(onChange: () => void) {
  const all = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
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
  };
  const problem = error !== null ? <Notice tone="error">{errorMessage(error, all)}</Notice> : null;
  return { pending, run, problem };
}

function Results({ poll }: { poll: LivePoll }) {
  const t = useTranslations('events.live');
  return (
    <View style={styles.list}>
      {poll.options.map((option) => {
        const percent = votePercent(option.votes, poll.total);
        return (
          <View key={option.id} style={styles.line}>
            <Text style={styles.text}>{`${option.text}: ${t('percent', { percent })}`}</Text>
            <View style={styles.track}>
              <View style={[styles.bar, { width: `${percent}%` }]} />
            </View>
          </View>
        );
      })}
      <Text style={styles.small}>{t('votes', { count: poll.total ?? 0 })}</Text>
    </View>
  );
}

function PollCard({ poll, base, live, onChange }: PartProps & { poll: LivePoll }) {
  const t = useTranslations('events.live');
  const { request } = useSession();
  const { pending, run, problem } = useAction(onChange);
  const [choice, setChoice] = useState<string | null>(null);
  const chair = `${base}/chair/polls/${poll.id}`;
  return (
    <Card>
      <Heading>{poll.question}</Heading>
      {problem}
      {poll.status === 'DRAFT' && <Tag tone="warning">{t('pollDraft')}</Tag>}
      {poll.status === 'CLOSED' && <Body muted>{t('pollClosed')}</Body>}
      {poll.status === 'OPEN' && !poll.voted && (
        <>
          {poll.options.map((option) => (
            <Toggle
              key={option.id}
              label={option.text}
              value={choice === option.id}
              onChange={() => setChoice(option.id)}
            />
          ))}
          <Button
            label={t('vote')}
            pending={pending}
            disabled={!choice}
            onPress={() =>
              void run(() =>
                request(`${base}/polls/${poll.id}/vote`, asJson('POST', { optionId: choice })),
              )
            }
          />
        </>
      )}
      {poll.total !== null && <Results poll={poll} />}
      {poll.voted && <Body muted>{t('voted')}</Body>}
      {live.canChair && poll.status === 'DRAFT' && (
        <>
          <Button
            label={t('openPoll')}
            pending={pending}
            onPress={() => void run(() => request(`${chair}/open`, asJson('POST')))}
          />
          <Button
            label={t('removePoll')}
            variant="secondary"
            pending={pending}
            onPress={() => void run(() => request(chair, asJson('DELETE')))}
          />
        </>
      )}
      {live.canChair && poll.status === 'OPEN' && (
        <Button
          label={t('closePoll')}
          variant="secondary"
          pending={pending}
          onPress={() => void run(() => request(`${chair}/close`, asJson('POST')))}
        />
      )}
    </Card>
  );
}

function Polls(props: PartProps) {
  const t = useTranslations('events.live');
  return (
    <View style={styles.list}>
      <Heading>{t('polls')}</Heading>
      {props.live.polls.length === 0 && <Body muted>{t('noPolls')}</Body>}
      {props.live.polls.map((poll) => (
        <PollCard key={poll.id} poll={poll} {...props} />
      ))}
      <Text style={styles.small}>{t('votesAnonymous')}</Text>
    </View>
  );
}

function QuestionCard({ question, base, live, onChange }: PartProps & { question: LiveQuestion }) {
  const t = useTranslations('events.live');
  const { request } = useSession();
  const { pending, run, problem } = useAction(onChange);
  const setStatus = (status: 'VISIBLE' | 'ANSWERED' | 'HIDDEN') =>
    void run(() =>
      request(`${base}/chair/questions/${question.id}/status`, asJson('PUT', { status })),
    );
  const asker =
    question.authorName ??
    (question.guestNumber !== null
      ? t('guestName', { number: question.guestNumber })
      : t('anonymous'));
  const shown = question.status === 'VISIBLE' || question.status === 'ANSWERED';
  return (
    <Card>
      <Text style={styles.text}>{question.text}</Text>
      <Text style={styles.small}>
        {asker}
        {question.status !== 'VISIBLE' ? ` · ${t(`status.${question.status}`)}` : ''}
      </Text>
      {problem}
      {shown && (
        <Button
          label={t('upvote', { count: question.upvotes })}
          variant={question.upvoted ? 'primary' : 'secondary'}
          pending={pending}
          onPress={() =>
            void run(() =>
              request(
                `${base}/questions/${question.id}/upvote`,
                asJson(question.upvoted ? 'DELETE' : 'PUT'),
              ),
            )
          }
        />
      )}
      {live.canModerate && question.status !== 'VISIBLE' && (
        <Button
          label={t('letThrough')}
          variant="secondary"
          pending={pending}
          onPress={() => setStatus('VISIBLE')}
        />
      )}
      {live.canModerate && question.status === 'VISIBLE' && (
        <Button
          label={t('markAnswered')}
          variant="secondary"
          pending={pending}
          onPress={() => setStatus('ANSWERED')}
        />
      )}
      {live.canModerate && question.status !== 'HIDDEN' && (
        <Button
          label={t('hide')}
          variant="secondary"
          pending={pending}
          onPress={() => setStatus('HIDDEN')}
        />
      )}
    </Card>
  );
}

function Questions(props: PartProps) {
  const { base, live, onChange } = props;
  const t = useTranslations('events.live');
  const { request } = useSession();
  const { pending, run, problem } = useAction(onChange);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sent, setSent] = useState(false);

  async function ask() {
    setSent(false);
    const done = await run(() => request(`${base}/questions`, asJson('POST', { text, anonymous })));
    if (done) {
      setText('');
      setSent(true);
    }
  }
  return (
    <View style={styles.list}>
      <Heading>{t('questions')}</Heading>
      {problem}
      {live.questionsOpen ? (
        <Card>
          <Field
            label={t('askLabel')}
            hint={t('noPatients')}
            value={text}
            onChangeText={setText}
            maxLength={500}
            multiline
          />
          {live.allowAnonymousQuestions && (
            <Toggle label={t('askAnonymously')} value={anonymous} onChange={setAnonymous} />
          )}
          <Button
            label={t('ask')}
            pending={pending}
            disabled={!text.trim()}
            onPress={() => void ask()}
          />
          {sent && (
            <Notice tone="success">
              {live.moderateQuestions ? t('sentForModeration') : t('sent')}
            </Notice>
          )}
        </Card>
      ) : (
        <Body muted>{t('questionsClosed')}</Body>
      )}
      {live.questions.length === 0 && <Body muted>{t('noQuestions')}</Body>}
      {questionsInOrder(live.questions).map((question) => (
        <QuestionCard key={question.id} question={question} {...props} />
      ))}
    </View>
  );
}

function Feedback({ base, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const { request } = useSession();
  const { pending, run, problem } = useAction(onChange);
  const [rating, setRating] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  if (!live.feedbackOpen && !live.feedbackGiven) return null;
  return (
    <View style={styles.list}>
      <Heading>{t('feedback')}</Heading>
      {problem}
      {live.feedbackGiven ? (
        <Notice tone="success">{t('feedbackThanks')}</Notice>
      ) : (
        <Card>
          <Choices
            label={t('rating')}
            options={['1', '2', '3', '4', '5'].map((value) => ({ value, label: value }))}
            value={rating ?? ''}
            onChange={setRating}
          />
          <Field label={t('comment')} value={comment} onChangeText={setComment} maxLength={1000} />
          <Text style={styles.small}>{t('feedbackAnonymous')}</Text>
          <Button
            label={t('sendFeedback')}
            pending={pending}
            disabled={!rating}
            onPress={() =>
              void run(() =>
                request(
                  `${base}/feedback`,
                  asJson('POST', {
                    rating: Number(rating),
                    ...(comment.trim() ? { comment } : {}),
                  }),
                ),
              )
            }
          />
        </Card>
      )}
    </View>
  );
}

function ChairPanel({ base, live, onChange }: PartProps) {
  const t = useTranslations('events.live');
  const locale = useLocale();
  const { request } = useSession();
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

  useEffect(() => {
    if (!showCode) return;
    let active = true;
    const load = () =>
      request<{ url: string }>(`${base}/chair/attendance-code?locale=${locale}`)
        .then((result) => active && setCode(result.url))
        .catch(() => active && setCode(null));
    void load();
    const timer = setInterval(() => void load(), CODE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [request, base, locale, showCode]);

  const filled = options.filter((option) => option.trim());
  async function createPoll() {
    const done = await run(() =>
      request(`${base}/chair/polls`, asJson('POST', { question, options: filled })),
    );
    if (done) {
      setQuestion('');
      setOptions(['', '']);
    }
  }
  const setting = (body: object) =>
    void run(() => request(`${base}/chair/settings`, asJson('PATCH', body)));
  return (
    <Card>
      <Heading>{t('chairTitle')}</Heading>
      {problem}
      <Toggle
        label={t('moderateFirst')}
        value={live.moderateQuestions}
        disabled={pending}
        onChange={(moderateQuestions) => setting({ moderateQuestions })}
      />
      <Toggle
        label={t('allowAnonymous')}
        value={live.allowAnonymousQuestions}
        disabled={pending}
        onChange={(allowAnonymousQuestions) => setting({ allowAnonymousQuestions })}
      />
      <Heading>{t('newPoll')}</Heading>
      <Field
        label={t('pollQuestion')}
        value={question}
        onChangeText={setQuestion}
        maxLength={500}
      />
      {options.map((option, index) => (
        <Field
          key={index}
          label={t('pollOption', { number: index + 1 })}
          value={option}
          maxLength={200}
          onChangeText={(value) =>
            setOptions((list) => list.map((item, at) => (at === index ? value : item)))
          }
        />
      ))}
      {options.length < 8 && (
        <Button
          label={t('addOption')}
          variant="secondary"
          onPress={() => setOptions((list) => [...list, ''])}
        />
      )}
      <Button
        label={t('savePoll')}
        pending={pending}
        disabled={!question.trim() || filled.length < 2}
        onPress={() => void createPoll()}
      />
      <Heading>{t('attendanceTitle')}</Heading>
      <Button
        label={showCode ? t('hideCode') : t('showCode')}
        variant="secondary"
        onPress={() => setShowCode((shown) => !shown)}
      />
      {showCode && code && <QrCode value={code} label={t('attendanceTitle')} />}
      <Heading>{t('feedbackSummary')}</Heading>
      <Button
        label={t('readFeedback')}
        variant="secondary"
        pending={pending}
        onPress={() =>
          void run(async () =>
            setSummary(
              await request<{ count: number; average: number | null; comments: string[] }>(
                `${base}/chair/feedback`,
              ),
            ),
          )
        }
      />
      {summary && (
        <>
          <Body>
            {summary.average === null
              ? t('noFeedback')
              : t('feedbackResult', { average: summary.average, count: summary.count })}
          </Body>
          {summary.comments.map((comment, index) => (
            <Body key={index} muted>
              {comment}
            </Body>
          ))}
        </>
      )}
    </Card>
  );
}

function QrCode({ value, label, size = 260 }: { value: string; label: string; size?: number }) {
  const { data } = encode(value, { ecc: 'M', border: 4 });
  const count = data.length;
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
        <Rect width={count} height={count} fill="#ffffff" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}

/** The screen a conference's guest link opens on a phone with nobody signed in (M32 plan §4). */
export function GuestEntry({
  slug,
  code,
  onCancel,
}: {
  slug: string;
  code: string;
  onCancel: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('events.guest');
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function enter() {
    setPending(true);
    setError(null);
    try {
      await session.enterAsGuest(slug, code);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }
  return (
    <Screen>
      <Title>{t('title')}</Title>
      <Body>{t('explain')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button label={t('enter')} pending={pending} onPress={() => void enter()} />
      <Button label={all('mobile.signIn.submit')} variant="link" onPress={onCancel} />
      <Text style={styles.small}>{t('demoNotice')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  line: { gap: 2 },
  text: { fontSize: 16, color: semantic.text },
  small: { fontSize: 14, color: semantic.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: semantic.border, overflow: 'hidden' },
  bar: { height: 8, backgroundColor: semantic.primary },
});
