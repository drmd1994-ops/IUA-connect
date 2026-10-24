/**
 * The review of a journal club entry (M31 plan §3, owner answer §10.1): an editor writes and
 * submits it, and another editor publishes it (four eyes). Editors are those with
 * `journalclub.manage`, or `journalclub.subspecialty` for the entry's subspecialty.
 *
 *   DRAFT ─SUBMIT─▶ IN_REVIEW ─PUBLISH─▶ PUBLISHED ─ARCHIVE─▶ ARCHIVED
 *     ▲                 │                    │
 *     ╰──SEND_BACK──────╯                    │
 *     ╰──TAKE_BACK───────────────────────────╯   (to correct it; it is reviewed again)
 */
export type JournalClubStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type JournalClubAction = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_BACK' | 'ARCHIVE';

export const JOURNAL_CLUB_ACTIONS: readonly JournalClubAction[] = [
  'SUBMIT',
  'SEND_BACK',
  'PUBLISH',
  'TAKE_BACK',
  'ARCHIVE',
];

const RULES: Record<
  JournalClubAction,
  { from: JournalClubStatus; to: JournalClubStatus; fourEyes?: boolean }
> = {
  SUBMIT: { from: 'DRAFT', to: 'IN_REVIEW' },
  SEND_BACK: { from: 'IN_REVIEW', to: 'DRAFT' },
  PUBLISH: { from: 'IN_REVIEW', to: 'PUBLISHED', fourEyes: true },
  TAKE_BACK: { from: 'PUBLISHED', to: 'DRAFT' },
  ARCHIVE: { from: 'PUBLISHED', to: 'ARCHIVED' },
};

export interface JournalClubTransitionInput {
  status: JournalClubStatus;
  submittedBy: string | null;
  actorUserId: string;
  /** An editor for the entry's subspecialty. */
  canEdit: boolean;
  comment?: string;
}

export type JournalClubTransitionResult =
  | { ok: true; to: JournalClubStatus }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_FAILED';
      code: string;
    };

export function planJournalClubTransition(
  action: JournalClubAction,
  input: JournalClubTransitionInput,
): JournalClubTransitionResult {
  const rule = RULES[action];
  if (!input.canEdit) return { ok: false, error: 'FORBIDDEN', code: 'journalClubNotAllowed' };
  if (input.status !== rule.from) {
    return { ok: false, error: 'BUSINESS_RULE_VIOLATION', code: 'journalClubTransitionNotAllowed' };
  }
  if (rule.fourEyes && input.submittedBy === input.actorUserId) {
    return { ok: false, error: 'FORBIDDEN', code: 'ownSubmission' };
  }
  if (action === 'SEND_BACK' && !input.comment?.trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', code: 'commentRequired' };
  }
  return { ok: true, to: rule.to };
}

export type PollAnswer = 'YES' | 'PERHAPS' | 'NO';
export const POLL_ANSWERS: readonly PollAnswer[] = ['YES', 'PERHAPS', 'NO'];

/**
 * Whether the reader sees the poll's totals: after answering, or once the entry is archived
 * (owner answer §10; plan §3). Never who answered what.
 */
export function showsTotals(status: JournalClubStatus, answered: boolean): boolean {
  return answered || status === 'ARCHIVED';
}

/** An entry's month as its first day ("2026-10-01"), from "2026-10". */
export function monthStart(month: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return new Date(Date.UTC(Number(match[1]), m - 1, 1));
}
