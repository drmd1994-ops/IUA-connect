import { type PermissionKey } from '@iua/shared';
import {
  type Readiness,
  type TransitionInput,
  canEdit,
  planTransition,
  submitProblem,
} from './education-workflow';

describe('education workflow', () => {
  const editor = new Set<PermissionKey>(['education.manage']);
  const reviewer = new Set<PermissionKey>(['education.manage', 'education.review']);
  const input = (extra: Partial<TransitionInput>): TransitionInput => ({
    status: 'DRAFT',
    submittedBy: null,
    actorUserId: 'reviewer',
    permissions: reviewer,
    ...extra,
  });

  it('runs draft → review → published → archived', () => {
    expect(planTransition('SUBMIT', input({ permissions: editor }))).toEqual({
      ok: true,
      to: 'IN_REVIEW',
    });
    expect(
      planTransition('PUBLISH', input({ status: 'IN_REVIEW', submittedBy: 'editor' })),
    ).toEqual({ ok: true, to: 'PUBLISHED' });
    expect(planTransition('ARCHIVE', input({ status: 'PUBLISHED' }))).toEqual({
      ok: true,
      to: 'ARCHIVED',
    });
  });

  it('sends back only with a comment', () => {
    const inReview = input({ status: 'IN_REVIEW', submittedBy: 'editor' });
    expect(planTransition('SEND_BACK', inReview)).toMatchObject({ code: 'commentRequired' });
    expect(planTransition('SEND_BACK', { ...inReview, comment: '  ' })).toMatchObject({
      code: 'commentRequired',
    });
    expect(planTransition('SEND_BACK', { ...inReview, comment: 'Add a reference' })).toEqual({
      ok: true,
      to: 'DRAFT',
    });
  });

  it('takes a published item down to a draft, to be edited and reviewed again', () => {
    expect(planTransition('TAKE_DOWN', input({ status: 'PUBLISHED' }))).toEqual({
      ok: true,
      to: 'DRAFT',
    });
  });

  it('never lets the submitter approve their own item', () => {
    expect(
      planTransition('PUBLISH', input({ status: 'IN_REVIEW', submittedBy: 'reviewer' })),
    ).toEqual({ ok: false, error: 'FORBIDDEN', code: 'ownSubmission' });
  });

  it('keeps reviewing to reviewers', () => {
    for (const action of ['SEND_BACK', 'PUBLISH', 'TAKE_DOWN', 'ARCHIVE'] as const) {
      expect(
        planTransition(action, input({ status: 'IN_REVIEW', permissions: editor, comment: 'x' })),
      ).toMatchObject({ error: 'FORBIDDEN', code: 'educationActionNotAllowed' });
    }
  });

  it('refuses steps that don’t fit the current state', () => {
    expect(planTransition('PUBLISH', input({ status: 'DRAFT' }))).toMatchObject({
      code: 'educationTransitionNotAllowed',
    });
    expect(planTransition('SUBMIT', input({ status: 'PUBLISHED' }))).toMatchObject({
      code: 'educationTransitionNotAllowed',
    });
    expect(planTransition('ARCHIVE', input({ status: 'ARCHIVED' }))).toMatchObject({
      code: 'educationTransitionNotAllowed',
    });
  });

  it('lets editors change drafts and reviewers correct items in review', () => {
    expect(canEdit('DRAFT', editor)).toBe(true);
    expect(canEdit('IN_REVIEW', editor)).toBe(false);
    expect(canEdit('IN_REVIEW', reviewer)).toBe(true);
    expect(canEdit('PUBLISHED', reviewer)).toBe(false);
    expect(canEdit('ARCHIVED', reviewer)).toBe(false);
    expect(canEdit('DRAFT', new Set())).toBe(false);
  });

  describe('what each type needs before review', () => {
    const base: Readiness = {
      type: 'ARTICLE',
      hebrewTitle: true,
      hebrewText: true,
      hasLink: false,
      videoPending: false,
      fileCount: 0,
      lessonCount: 0,
    };

    it('needs a Hebrew title for every type', () => {
      expect(submitProblem({ ...base, hebrewTitle: false })).toBe('educationHebrewRequired');
    });

    it.each(['VIDEO', 'WEBINAR', 'SURGICAL_VIDEO', 'PODCAST'] as const)(
      '%s needs a link, or to be marked as pending',
      (type) => {
        expect(submitProblem({ ...base, type })).toBe('educationLinkRequired');
        expect(submitProblem({ ...base, type, hasLink: true })).toBeNull();
        expect(submitProblem({ ...base, type, videoPending: true })).toBeNull();
      },
    );

    it.each(['PDF', 'PRESENTATION'] as const)('%s needs a file', (type) => {
      expect(submitProblem({ ...base, type })).toBe('educationFileRequired');
      expect(submitProblem({ ...base, type, fileCount: 1 })).toBeNull();
    });

    it.each(['ARTICLE', 'CASE'] as const)('%s needs its text', (type) => {
      expect(submitProblem({ ...base, type, hebrewText: false })).toBe('educationTextRequired');
      expect(submitProblem({ ...base, type })).toBeNull();
    });

    it('a course needs at least one lesson', () => {
      expect(submitProblem({ ...base, type: 'COURSE' })).toBe('educationLessonsRequired');
      expect(submitProblem({ ...base, type: 'COURSE', lessonCount: 2 })).toBeNull();
    });
  });
});
