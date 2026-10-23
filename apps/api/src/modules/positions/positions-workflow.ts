/**
 * The review of a position (M28 plan §2, owner answer §10.1): its writer submits it, and someone
 * else reviews it before it shows (four eyes).
 *
 *   DRAFT ─SUBMIT─▶ IN_REVIEW ─PUBLISH─▶ PUBLISHED ─ARCHIVE─▶ ARCHIVED
 *     ▲                 │                    │
 *     ╰──SEND_BACK──────╯                    │
 *     ╰──TAKE_BACK───────────────────────────╯   (to correct it; it is reviewed again)
 *
 * "Write" is `positions.manage` where the position's owner is, or being the director of its
 * department; "review" is `positions.review` there.
 */
export type PositionStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type PositionAction = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_BACK' | 'ARCHIVE';

export const POSITION_ACTIONS: readonly PositionAction[] = [
  'SUBMIT',
  'SEND_BACK',
  'PUBLISH',
  'TAKE_BACK',
  'ARCHIVE',
];

type Right = 'write' | 'review';

interface Rule {
  from: PositionStatus;
  to: PositionStatus;
  /** Any one of these. */
  rights: Right[];
  /** The submitter may not do this (four eyes). */
  fourEyes?: boolean;
}

const RULES: Record<PositionAction, Rule> = {
  SUBMIT: { from: 'DRAFT', to: 'IN_REVIEW', rights: ['write'] },
  SEND_BACK: { from: 'IN_REVIEW', to: 'DRAFT', rights: ['review'] },
  PUBLISH: { from: 'IN_REVIEW', to: 'PUBLISHED', rights: ['review'], fourEyes: true },
  TAKE_BACK: { from: 'PUBLISHED', to: 'DRAFT', rights: ['write', 'review'] },
  ARCHIVE: { from: 'PUBLISHED', to: 'ARCHIVED', rights: ['write', 'review'] },
};

export interface PositionTransitionInput {
  status: PositionStatus;
  submittedBy: string | null;
  actorUserId: string;
  canWrite: boolean;
  canReview: boolean;
  comment?: string;
}

export type PositionTransitionResult =
  | { ok: true; to: PositionStatus }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_FAILED';
      code: string;
    };

export function planPositionTransition(
  action: PositionAction,
  input: PositionTransitionInput,
): PositionTransitionResult {
  const rule = RULES[action];
  const has = { write: input.canWrite, review: input.canReview };
  if (!rule.rights.some((right) => has[right])) {
    return { ok: false, error: 'FORBIDDEN', code: 'positionActionNotAllowed' };
  }
  if (input.status !== rule.from) {
    return { ok: false, error: 'BUSINESS_RULE_VIOLATION', code: 'positionTransitionNotAllowed' };
  }
  if (rule.fourEyes && input.submittedBy === input.actorUserId) {
    return { ok: false, error: 'FORBIDDEN', code: 'ownSubmission' };
  }
  if (action === 'SEND_BACK' && !input.comment?.trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', code: 'commentRequired' };
  }
  return { ok: true, to: rule.to };
}
