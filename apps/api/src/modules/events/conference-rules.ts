/** Pure rules of conference mode (M32 plan §3). */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Questions may come in a little before a session and while the chair still takes them after. */
const QUESTIONS_FROM_MS = 15 * MINUTE;
const QUESTIONS_UNTIL_MS = 30 * MINUTE;
/** Feedback stays open for a week after the session. */
const FEEDBACK_UNTIL_MS = 7 * DAY;
/** A reminder goes out this long before a session in someone's schedule. */
export const SESSION_REMINDER_LEAD_MS = 10 * MINUTE;
/** Questions and guests go this long after the event (the owner's answer, plan §10). */
export const CONFERENCE_RETENTION_MS = 30 * DAY;

export function questionsOpen(session: { startAt: Date; endAt: Date }, now: Date): boolean {
  return (
    now.getTime() >= session.startAt.getTime() - QUESTIONS_FROM_MS &&
    now.getTime() <= session.endAt.getTime() + QUESTIONS_UNTIL_MS
  );
}

export function feedbackOpen(session: { startAt: Date; endAt: Date }, now: Date): boolean {
  return (
    now.getTime() >= session.startAt.getTime() &&
    now.getTime() <= session.endAt.getTime() + FEEDBACK_UNTIL_MS
  );
}

/** A reminder is due from its time until the session starts; if the job was down, it is late. */
export function sessionReminderDue(startAt: Date, now: Date): boolean {
  return (
    now.getTime() >= startAt.getTime() - SESSION_REMINDER_LEAD_MS &&
    now.getTime() < startAt.getTime()
  );
}

/** What a poll shows a reader: results only to a chair, after voting, or once it is closed. */
export function showsResults(input: {
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  voted: boolean;
  canChair: boolean;
}): boolean {
  return input.canChair || input.voted || input.status === 'CLOSED';
}

/** A question waits for a moderator, unless the chair turned moderation off for the session. */
export function firstQuestionStatus(moderate: boolean): 'PENDING' | 'VISIBLE' {
  return moderate ? 'PENDING' : 'VISIBLE';
}

/**
 * The guest entry is open only on a demo (never in real production), inside the time the event's
 * manager set, and for an event that is published.
 */
export function guestEntryOpen(
  event: {
    status: string;
    guestCode: string | null;
    guestEntryFrom: Date | null;
    guestEntryUntil: Date | null;
  },
  demo: boolean,
  now: Date,
): boolean {
  if (!demo || event.status !== 'PUBLISHED' || !event.guestCode) return false;
  if (!event.guestEntryFrom || !event.guestEntryUntil) return false;
  return (
    now.getTime() >= event.guestEntryFrom.getTime() &&
    now.getTime() <= event.guestEntryUntil.getTime()
  );
}

/** Real production has no guests: only a development server or the hosted demo. */
export function isDemoServer(env: { NODE_ENV: string; DEMO_HOSTED?: boolean | undefined }) {
  return env.NODE_ENV !== 'production' || env.DEMO_HOSTED === true;
}

/**
 * The demonstration starts from now: the first session began ten minutes ago, and the others
 * keep their distance from it and their lengths.
 */
export function shiftedFromNow<T extends { startAt: Date; endAt: Date }>(
  sessions: readonly T[],
  now: Date,
): (T & { startAt: Date; endAt: Date })[] {
  const first = Math.min(...sessions.map((session) => session.startAt.getTime()));
  const shift = now.getTime() - 10 * MINUTE - first;
  return sessions.map((session) => ({
    ...session,
    startAt: new Date(session.startAt.getTime() + shift),
    endAt: new Date(session.endAt.getTime() + shift),
  }));
}
