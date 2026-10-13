import { type PermissionKey } from '@iua/shared';

/**
 * News workflow (M3 plan §3; owner answers §11): editors write and submit; admins review,
 * publish or schedule; nobody approves their own submission (four eyes).
 *
 *   DRAFT ─SUBMIT─▶ IN_REVIEW ─PUBLISH──▶ PUBLISHED ─ARCHIVE─▶ ARCHIVED
 *     ▲                │  ╰──SCHEDULE─▶ SCHEDULED ─(job at publish_at)─▶ PUBLISHED
 *     ╰──SEND_BACK─────╯                  │
 *     ╰──────────UNSCHEDULE───────────────╯
 *
 * A revision of a published item is drafted, submitted and reviewed the same way; PUBLISH copies
 * it onto the live item at once (revisions are not scheduled).
 */
export type NewsStatus = 'DRAFT' | 'IN_REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
export type NewsAction = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'SCHEDULE' | 'UNSCHEDULE' | 'ARCHIVE';

export const NEWS_ACTIONS: readonly NewsAction[] = [
  'SUBMIT',
  'SEND_BACK',
  'PUBLISH',
  'SCHEDULE',
  'UNSCHEDULE',
  'ARCHIVE',
];

interface Rule {
  from: NewsStatus;
  to: NewsStatus;
  permissions: PermissionKey[];
  /** The submitter may not do this (four eyes). */
  fourEyes?: boolean;
  /** Not for revisions. */
  liveOnly?: boolean;
}

const RULES: Record<NewsAction, Rule> = {
  SUBMIT: { from: 'DRAFT', to: 'IN_REVIEW', permissions: ['news.create'] },
  SEND_BACK: { from: 'IN_REVIEW', to: 'DRAFT', permissions: ['news.review'] },
  PUBLISH: {
    from: 'IN_REVIEW',
    to: 'PUBLISHED',
    permissions: ['news.review', 'news.publish'],
    fourEyes: true,
  },
  SCHEDULE: {
    from: 'IN_REVIEW',
    to: 'SCHEDULED',
    permissions: ['news.review', 'news.publish'],
    fourEyes: true,
    liveOnly: true,
  },
  UNSCHEDULE: { from: 'SCHEDULED', to: 'DRAFT', permissions: ['news.review'], liveOnly: true },
  ARCHIVE: { from: 'PUBLISHED', to: 'ARCHIVED', permissions: ['news.publish'], liveOnly: true },
};

export interface TransitionInput {
  status: NewsStatus;
  isRevision: boolean;
  submittedBy: string | null;
  actorUserId: string;
  permissions: ReadonlySet<PermissionKey>;
  comment?: string;
  publishAt?: Date;
  now: Date;
}

export type TransitionResult =
  | { ok: true; to: NewsStatus }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_FAILED';
      code: string;
    };

/** Scheduling needs at least this much lead time, so the item isn't scheduled into the past. */
export const MIN_SCHEDULE_LEAD_MS = 30_000;

export function planTransition(action: NewsAction, input: TransitionInput): TransitionResult {
  const rule = RULES[action];
  if (!rule.permissions.every((permission) => input.permissions.has(permission))) {
    return { ok: false, error: 'FORBIDDEN', code: 'newsActionNotAllowed' };
  }
  if (input.status !== rule.from || (rule.liveOnly && input.isRevision)) {
    return { ok: false, error: 'BUSINESS_RULE_VIOLATION', code: 'newsTransitionNotAllowed' };
  }
  if (rule.fourEyes && input.submittedBy === input.actorUserId) {
    return { ok: false, error: 'FORBIDDEN', code: 'ownSubmission' };
  }
  if (action === 'SEND_BACK' && !input.comment?.trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', code: 'commentRequired' };
  }
  if (action === 'SCHEDULE') {
    if (!input.publishAt)
      return { ok: false, error: 'VALIDATION_FAILED', code: 'publishAtRequired' };
    if (input.publishAt.getTime() < input.now.getTime() + MIN_SCHEDULE_LEAD_MS) {
      return { ok: false, error: 'VALIDATION_FAILED', code: 'publishAtInPast' };
    }
  }
  return { ok: true, to: rule.to };
}
