/**
 * The review of a case (M26 plan §4; owner answers §10). Nobody sees a case before a reviewer
 * of its subspecialty approves it, and the author never approves their own.
 *
 *   DRAFT ─submit─▶ IN_REVIEW ─APPROVE─▶ PUBLISHED ─report─▶ HIDDEN ─RESTORE─▶ PUBLISHED
 *     ▲                 │                   │                   │
 *     ╰── RETURNED ◀────╯ RETURN            ├─TAKE_BACK─▶ RETURNED
 *        (changed, sent again)              ╰─REMOVE─▶ REMOVED ◀─REMOVE─╯
 */
export type CaseStatus = 'DRAFT' | 'IN_REVIEW' | 'RETURNED' | 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
export type ReviewAction = 'APPROVE' | 'RETURN' | 'RESTORE' | 'REMOVE' | 'TAKE_BACK' | 'WEEK';

const RULES: Record<
  ReviewAction,
  { from: CaseStatus[]; to: CaseStatus; noteRequired?: boolean; notAuthor?: boolean }
> = {
  APPROVE: { from: ['IN_REVIEW'], to: 'PUBLISHED', notAuthor: true },
  RETURN: { from: ['IN_REVIEW'], to: 'RETURNED', noteRequired: true },
  RESTORE: { from: ['HIDDEN'], to: 'PUBLISHED', notAuthor: true },
  REMOVE: { from: ['PUBLISHED', 'HIDDEN'], to: 'REMOVED', noteRequired: true },
  TAKE_BACK: { from: ['PUBLISHED'], to: 'RETURNED', noteRequired: true },
  // The case of the week: stays published.
  WEEK: { from: ['PUBLISHED'], to: 'PUBLISHED' },
};

export type ReviewResult =
  | { ok: true; to: CaseStatus }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_FAILED';
      code: string;
    };

export function planReview(
  action: ReviewAction,
  input: { status: CaseStatus; isAuthor: boolean; canReview: boolean; note?: string },
): ReviewResult {
  const rule = RULES[action];
  if (!input.canReview) return { ok: false, error: 'FORBIDDEN', code: 'caseNotReviewer' };
  if (!rule.from.includes(input.status)) {
    return { ok: false, error: 'BUSINESS_RULE_VIOLATION', code: 'caseStepNotAllowed' };
  }
  if (rule.notAuthor && input.isAuthor) {
    return { ok: false, error: 'FORBIDDEN', code: 'caseOwnReview' };
  }
  if (rule.noteRequired && !input.note?.trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', code: 'caseNoteRequired' };
  }
  return { ok: true, to: rule.to };
}

/** The author changes a case only while it is theirs to change: a draft, or returned. */
export const EDITABLE: readonly CaseStatus[] = ['DRAFT', 'RETURNED'];

/** Shown to every verified reader. Everything else: its author and reviewers only. */
export const VISIBLE: readonly CaseStatus[] = ['PUBLISHED'];

/** Cases an author may have open at once (not published, not removed). */
export const MAX_OPEN_CASES = 10;
