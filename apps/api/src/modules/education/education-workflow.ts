import { type PermissionKey } from '@iua/shared';

/**
 * The review workflow of education items and exam questions (M6 plan §3; owner answer §11.2):
 * editors write and submit; admins review and publish; nobody approves their own submission.
 *
 *   DRAFT ─SUBMIT─▶ IN_REVIEW ─PUBLISH─▶ PUBLISHED ─ARCHIVE─▶ ARCHIVED
 *     ▲                │                    │
 *     ╰──SEND_BACK─────╯                    │
 *     ╰──────────────TAKE_DOWN──────────────╯   (to edit a published item; hidden meanwhile)
 */
export type EducationStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type EducationAction = 'SUBMIT' | 'SEND_BACK' | 'PUBLISH' | 'TAKE_DOWN' | 'ARCHIVE';

export const EDUCATION_ACTIONS: readonly EducationAction[] = [
  'SUBMIT',
  'SEND_BACK',
  'PUBLISH',
  'TAKE_DOWN',
  'ARCHIVE',
];

interface Rule {
  from: EducationStatus;
  to: EducationStatus;
  permission: PermissionKey;
  /** The submitter may not do this (four eyes). */
  fourEyes?: boolean;
}

const RULES: Record<EducationAction, Rule> = {
  SUBMIT: { from: 'DRAFT', to: 'IN_REVIEW', permission: 'education.manage' },
  SEND_BACK: { from: 'IN_REVIEW', to: 'DRAFT', permission: 'education.review' },
  PUBLISH: { from: 'IN_REVIEW', to: 'PUBLISHED', permission: 'education.review', fourEyes: true },
  TAKE_DOWN: { from: 'PUBLISHED', to: 'DRAFT', permission: 'education.review' },
  ARCHIVE: { from: 'PUBLISHED', to: 'ARCHIVED', permission: 'education.review' },
};

export interface TransitionInput {
  status: EducationStatus;
  submittedBy: string | null;
  actorUserId: string;
  permissions: ReadonlySet<PermissionKey>;
  comment?: string;
}

export type TransitionResult =
  | { ok: true; to: EducationStatus }
  | {
      ok: false;
      error: 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION' | 'VALIDATION_FAILED';
      code: string;
    };

export function planTransition(action: EducationAction, input: TransitionInput): TransitionResult {
  const rule = RULES[action];
  if (!input.permissions.has(rule.permission)) {
    return { ok: false, error: 'FORBIDDEN', code: 'educationActionNotAllowed' };
  }
  if (input.status !== rule.from) {
    return { ok: false, error: 'BUSINESS_RULE_VIOLATION', code: 'educationTransitionNotAllowed' };
  }
  if (rule.fourEyes && input.submittedBy === input.actorUserId) {
    return { ok: false, error: 'FORBIDDEN', code: 'ownSubmission' };
  }
  if (action === 'SEND_BACK' && !input.comment?.trim()) {
    return { ok: false, error: 'VALIDATION_FAILED', code: 'commentRequired' };
  }
  return { ok: true, to: rule.to };
}

/**
 * Who may change the text: an editor while it is a draft, a reviewer while it is in review (to
 * correct it before approving). Published and archived items are closed.
 */
export function canEdit(status: EducationStatus, permissions: ReadonlySet<PermissionKey>): boolean {
  if (status === 'DRAFT') return permissions.has('education.manage');
  if (status === 'IN_REVIEW') return permissions.has('education.review');
  return false;
}

export type EducationType =
  | 'VIDEO'
  | 'ARTICLE'
  | 'PDF'
  | 'PRESENTATION'
  | 'PODCAST'
  | 'WEBINAR'
  | 'SURGICAL_VIDEO'
  | 'CASE'
  | 'COURSE';

/** Types delivered as a link to where the recording is hosted (ADR 0008). */
export const LINKED_TYPES: readonly EducationType[] = [
  'VIDEO',
  'WEBINAR',
  'SURGICAL_VIDEO',
  'PODCAST',
];
const FILE_TYPES: readonly EducationType[] = ['PDF', 'PRESENTATION'];
const TEXT_TYPES: readonly EducationType[] = ['ARTICLE', 'CASE'];

export interface Readiness {
  type: EducationType;
  /** Hebrew is the fallback language, so it must exist before review. */
  hebrewTitle: boolean;
  hebrewText: boolean;
  hasLink: boolean;
  videoPending: boolean;
  fileCount: number;
  lessonCount: number;
}

/**
 * What an item still needs before it can be submitted, as an error-detail code; null when it is
 * ready. Each type has its own way of being delivered (M6 plan §2.2).
 */
export function submitProblem(item: Readiness): string | null {
  if (!item.hebrewTitle) return 'educationHebrewRequired';
  if (LINKED_TYPES.includes(item.type) && !item.hasLink && !item.videoPending) {
    return 'educationLinkRequired';
  }
  if (FILE_TYPES.includes(item.type) && item.fileCount === 0) return 'educationFileRequired';
  if (TEXT_TYPES.includes(item.type) && !item.hebrewText) return 'educationTextRequired';
  if (item.type === 'COURSE' && item.lessonCount === 0) return 'educationLessonsRequired';
  return null;
}
