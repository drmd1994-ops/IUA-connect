import { type PermissionKey } from '@medconnect/shared';
import { type TransitionInput, planTransition } from './news-workflow';

const EDITOR = new Set<PermissionKey>(['news.create']);
const ADMIN = new Set<PermissionKey>(['news.create', 'news.review', 'news.publish']);
const NOW = new Date('2026-10-01T09:00:00Z');

const base = (overrides: Partial<TransitionInput> = {}): TransitionInput => ({
  status: 'DRAFT',
  isRevision: false,
  submittedBy: null,
  actorUserId: 'reviewer',
  permissions: ADMIN,
  now: NOW,
  ...overrides,
});

describe('news workflow', () => {
  it('lets an editor submit a draft', () => {
    expect(planTransition('SUBMIT', base({ permissions: EDITOR }))).toEqual({
      ok: true,
      to: 'IN_REVIEW',
    });
  });

  it('lets only reviewers publish, and never the submitter (four eyes)', () => {
    const inReview = base({ status: 'IN_REVIEW', submittedBy: 'editor' });
    expect(planTransition('PUBLISH', { ...inReview, permissions: EDITOR })).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(planTransition('PUBLISH', inReview)).toEqual({ ok: true, to: 'PUBLISHED' });
    expect(planTransition('PUBLISH', { ...inReview, actorUserId: 'editor' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      code: 'ownSubmission',
    });
    expect(planTransition('SCHEDULE', { ...inReview, actorUserId: 'editor' })).toMatchObject({
      code: 'ownSubmission',
    });
  });

  it('needs a comment to send an item back', () => {
    const inReview = base({ status: 'IN_REVIEW', submittedBy: 'editor' });
    expect(planTransition('SEND_BACK', inReview)).toMatchObject({ code: 'commentRequired' });
    expect(planTransition('SEND_BACK', { ...inReview, comment: '  ' })).toMatchObject({
      code: 'commentRequired',
    });
    expect(planTransition('SEND_BACK', { ...inReview, comment: 'Fix the title' })).toEqual({
      ok: true,
      to: 'DRAFT',
    });
  });

  it('schedules only into the future', () => {
    const inReview = base({ status: 'IN_REVIEW', submittedBy: 'editor' });
    expect(planTransition('SCHEDULE', inReview)).toMatchObject({ code: 'publishAtRequired' });
    expect(
      planTransition('SCHEDULE', { ...inReview, publishAt: new Date(NOW.getTime() + 10_000) }),
    ).toMatchObject({ code: 'publishAtInPast' });
    expect(
      planTransition('SCHEDULE', { ...inReview, publishAt: new Date(NOW.getTime() + 3_600_000) }),
    ).toEqual({ ok: true, to: 'SCHEDULED' });
  });

  it('allows each action only from its own state', () => {
    expect(planTransition('PUBLISH', base({ status: 'DRAFT' }))).toMatchObject({
      code: 'newsTransitionNotAllowed',
    });
    expect(planTransition('ARCHIVE', base({ status: 'IN_REVIEW' }))).toMatchObject({
      code: 'newsTransitionNotAllowed',
    });
    expect(planTransition('UNSCHEDULE', base({ status: 'SCHEDULED' }))).toEqual({
      ok: true,
      to: 'DRAFT',
    });
    expect(planTransition('ARCHIVE', base({ status: 'PUBLISHED' }))).toEqual({
      ok: true,
      to: 'ARCHIVED',
    });
    expect(planTransition('SUBMIT', base({ status: 'ARCHIVED' }))).toMatchObject({
      code: 'newsTransitionNotAllowed',
    });
  });

  it('publishes revisions at once: no scheduling or archiving them', () => {
    const revision = base({ status: 'IN_REVIEW', isRevision: true, submittedBy: 'editor' });
    expect(planTransition('PUBLISH', revision)).toEqual({ ok: true, to: 'PUBLISHED' });
    expect(
      planTransition('SCHEDULE', { ...revision, publishAt: new Date(NOW.getTime() + 3_600_000) }),
    ).toMatchObject({ code: 'newsTransitionNotAllowed' });
  });
});
