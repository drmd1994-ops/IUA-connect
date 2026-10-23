/**
 * The limits of research projects and requests to join them (M27 plan §3), apart from the
 * database, so they can be tested as they are.
 */
export const MAX_OPEN_PROJECTS = 5;
export const MAX_WAITING_REQUESTS = 5;
const DAY = 24 * 60 * 60 * 1000;
/** After a decline, the same project can be asked again this long after. */
export const ASK_AGAIN_AFTER_MS = 30 * DAY;
/** A request not answered in this time closes by itself. */
export const REQUEST_LIFETIME_MS = 30 * DAY;
/** A project not confirmed for this long is marked "may be out of date", and its lead asked. */
export const STALE_AFTER_MS = 365 * DAY;
export const PROJECTS_PAGE_SIZE = 20;

export interface AskFacts {
  /** The project takes requests: open, not ended. */
  taking: boolean;
  /** The asker is the project's lead. */
  ownProject: boolean;
  /** A request or membership of the asker's in this project that is still open. */
  openWithProject: boolean;
  /** When this project last declined this person, if ever. */
  lastDeclinedAt: Date | null;
  /** The asker's requests waiting for an answer, to any project. */
  waiting: number;
  now: Date;
}

/** Why a request can't be sent now, or null when it can. */
export function askProblem(facts: AskFacts): string | null {
  if (facts.ownProject) return 'researchOwnProject';
  if (!facts.taking) return 'researchNotTaking';
  if (facts.openWithProject) return 'researchAlreadyOpen';
  if (
    facts.lastDeclinedAt &&
    facts.now.getTime() - facts.lastDeclinedAt.getTime() < ASK_AGAIN_AFTER_MS
  ) {
    return 'researchAskedRecently';
  }
  if (facts.waiting >= MAX_WAITING_REQUESTS) return 'researchTooManyWaiting';
  return null;
}

export type RequestState = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';
export type RequestAction = 'accept' | 'decline' | 'withdraw';
export type Side = 'lead' | 'asker';

const STEPS: Record<RequestAction, { to: RequestState; by: Side }> = {
  accept: { to: 'ACCEPTED', by: 'lead' },
  decline: { to: 'DECLINED', by: 'lead' },
  withdraw: { to: 'WITHDRAWN', by: 'asker' },
};

/** The state a step leads to, or why it can't be taken. Every step starts from PENDING. */
export function planStep(
  action: RequestAction,
  state: RequestState,
  side: Side,
): { ok: true; to: RequestState } | { ok: false; code: string } {
  const step = STEPS[action];
  if (step.by !== side) return { ok: false, code: 'researchActionNotAllowed' };
  if (state !== 'PENDING') return { ok: false, code: 'researchNotWaiting' };
  return { ok: true, to: step.to };
}

/** Whether a project should be marked "may be out of date". */
export function isStale(confirmedAt: Date, now = new Date()): boolean {
  return now.getTime() - confirmedAt.getTime() >= STALE_AFTER_MS;
}

/** The moment before which a waiting request has expired. */
export function expiredBefore(now: Date): Date {
  return new Date(now.getTime() - REQUEST_LIFETIME_MS);
}
