/**
 * The limits of mentorship requests (M28 plan §3, owner answer §10.6), apart from the database,
 * so they can be tested as they are.
 */
export const MAX_WAITING_REQUESTS = 3;
const DAY = 24 * 60 * 60 * 1000;
/** After a decline, the same mentor can be asked again this long after. */
export const ASK_AGAIN_AFTER_MS = 30 * DAY;
/** A request not answered in this time closes by itself. */
export const REQUEST_LIFETIME_MS = 30 * DAY;

export interface AskFacts {
  /** The mentee's requests waiting for an answer, to anyone. */
  waiting: number;
  /** A request or mentorship with this mentor that is still open. */
  openWithMentor: boolean;
  /** When this mentor last declined this mentee, if ever. */
  lastDeclinedAt: Date | null;
  /** The mentor's mentorships now, and how many they take. */
  mentorActive: number;
  mentorCapacity: number;
  now: Date;
}

/** Why a request can't be sent now, or null when it can. */
export function askProblem(facts: AskFacts): string | null {
  if (facts.openWithMentor) return 'mentorshipAlreadyOpen';
  if (
    facts.lastDeclinedAt &&
    facts.now.getTime() - facts.lastDeclinedAt.getTime() < ASK_AGAIN_AFTER_MS
  ) {
    return 'mentorshipAskedRecently';
  }
  if (facts.mentorActive >= facts.mentorCapacity) return 'mentorFull';
  if (facts.waiting >= MAX_WAITING_REQUESTS) return 'mentorshipTooManyWaiting';
  return null;
}

/** The moment before which a waiting request has expired. */
export function expiredBefore(now: Date): Date {
  return new Date(now.getTime() - REQUEST_LIFETIME_MS);
}

export type MentorshipState =
  'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED' | 'ENDED';
export type MentorshipAction = 'accept' | 'decline' | 'withdraw' | 'end';
export type Side = 'mentor' | 'mentee';

const STEPS: Record<MentorshipAction, { from: MentorshipState; to: MentorshipState; by: Side[] }> =
  {
    accept: { from: 'PENDING', to: 'ACCEPTED', by: ['mentor'] },
    decline: { from: 'PENDING', to: 'DECLINED', by: ['mentor'] },
    withdraw: { from: 'PENDING', to: 'WITHDRAWN', by: ['mentee'] },
    end: { from: 'ACCEPTED', to: 'ENDED', by: ['mentor', 'mentee'] },
  };

/**
 * The state a step leads to, or why it can't be taken. A person who is neither side gets
 * "not found" from the caller before this is asked.
 */
export function planStep(
  action: MentorshipAction,
  state: MentorshipState,
  side: Side,
): { ok: true; to: MentorshipState } | { ok: false; code: string } {
  const step = STEPS[action];
  if (!step.by.includes(side)) return { ok: false, code: 'mentorshipActionNotAllowed' };
  if (state !== step.from) {
    return {
      ok: false,
      code: step.from === 'PENDING' ? 'mentorshipNotWaiting' : 'mentorshipNotActive',
    };
  }
  return { ok: true, to: step.to };
}
