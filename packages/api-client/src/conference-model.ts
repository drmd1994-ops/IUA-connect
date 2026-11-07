import type { components } from './schema';

export type LiveSession = components['schemas']['LiveSessionDto'];
export type LivePoll = LiveSession['polls'][number];
export type LiveQuestion = LiveSession['questions'][number];

/** What a phone is told about an event: ids only (M32 plan §4). */
export type ConferenceEvent =
  | { type: 'polls' | 'questions'; sessionId: string }
  | { type: 'schedule' }
  | { type: 'ping' }
  /** Not from the server: the stream was away, or the page asks again by itself. */
  | { type: 'refresh' };

/** Without the stream, the live screens ask again this often. */
export const LIVE_FALLBACK_MS = 15_000;
/** A whole hall hears about a change at once, so each asks at a random moment within this. */
const ASK_AGAIN_WITHIN_MS = 1500;

export function askAgainDelay(random: () => number = Math.random): number {
  return Math.floor(random() * ASK_AGAIN_WITHIN_MS);
}

interface Timed {
  startAt: string;
  endAt: string;
}

/**
 * What is on now, and what starts next: every session of the earliest start still to come, since
 * two rooms may start together. Sessions touching the moment: one that ends now is over, and one
 * that starts now is on.
 */
export function nowAndNext<T extends Timed>(
  sessions: readonly T[],
  now: Date,
): { now: T[]; next: T[] } {
  const time = now.getTime();
  const on = sessions.filter(
    (session) => Date.parse(session.startAt) <= time && time < Date.parse(session.endAt),
  );
  const coming = sessions.filter((session) => Date.parse(session.startAt) > time);
  const earliest = Math.min(...coming.map((session) => Date.parse(session.startAt)));
  return {
    now: sortByStart(on),
    next: sortByStart(coming.filter((session) => Date.parse(session.startAt) === earliest)),
  };
}

function sortByStart<T extends Timed>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

/** Whether an event is running, so its page opens with what is on. */
export function eventRunning(event: Timed, now: Date): boolean {
  return Date.parse(event.startAt) <= now.getTime() && now.getTime() < Date.parse(event.endAt);
}

/** A share of the votes, as a whole percent. */
export function votePercent(votes: number | null, total: number | null): number {
  if (!votes || !total) return 0;
  return Math.round((votes / total) * 100);
}

/** The block of a text/event-stream as an event, or null when it is not one of ours. */
export function parseConferenceEvent(block: string): ConferenceEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  if (!data) return null;
  try {
    const event = JSON.parse(data) as { type?: unknown; sessionId?: unknown };
    if (event.type === 'ping' || event.type === 'schedule') return { type: event.type };
    if (
      (event.type === 'polls' || event.type === 'questions') &&
      typeof event.sessionId === 'string'
    ) {
      return { type: event.type, sessionId: event.sessionId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Questions as a reader meets them: what waits for an answer first, the most wanted on top. */
export function questionsInOrder(questions: readonly LiveQuestion[]): LiveQuestion[] {
  const rank = { PENDING: 0, VISIBLE: 1, ANSWERED: 2, HIDDEN: 3 } as const;
  return [...questions].sort((a, b) => rank[a.status] - rank[b.status] || b.upvotes - a.upvotes);
}
