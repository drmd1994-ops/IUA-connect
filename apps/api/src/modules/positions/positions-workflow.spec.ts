import { type PositionTransitionInput, planPositionTransition } from './positions-workflow';

const WRITER = 'writer';
const REVIEWER = 'reviewer';

function input(over: Partial<PositionTransitionInput> = {}): PositionTransitionInput {
  return {
    status: 'DRAFT',
    submittedBy: null,
    actorUserId: WRITER,
    canWrite: true,
    canReview: false,
    ...over,
  };
}

describe('the review of a position', () => {
  it('lets the writer submit a draft', () => {
    expect(planPositionTransition('SUBMIT', input())).toEqual({ ok: true, to: 'IN_REVIEW' });
  });

  it('refuses to submit without the right to write', () => {
    expect(planPositionTransition('SUBMIT', input({ canWrite: false, canReview: true }))).toEqual(
      expect.objectContaining({ ok: false, code: 'positionActionNotAllowed' }),
    );
  });

  it('lets someone else publish it', () => {
    const inReview = input({
      status: 'IN_REVIEW',
      submittedBy: WRITER,
      actorUserId: REVIEWER,
      canReview: true,
    });
    expect(planPositionTransition('PUBLISH', inReview)).toEqual({ ok: true, to: 'PUBLISHED' });
  });

  it('never lets the person who submitted it publish it', () => {
    const own = input({ status: 'IN_REVIEW', submittedBy: WRITER, canReview: true });
    expect(planPositionTransition('PUBLISH', own)).toEqual(
      expect.objectContaining({ ok: false, error: 'FORBIDDEN', code: 'ownSubmission' }),
    );
  });

  it('refuses to publish without the right to review', () => {
    const inReview = input({ status: 'IN_REVIEW', submittedBy: 'someone', actorUserId: WRITER });
    expect(planPositionTransition('PUBLISH', inReview)).toEqual(
      expect.objectContaining({ ok: false, code: 'positionActionNotAllowed' }),
    );
  });

  it('needs a reason to send it back', () => {
    const inReview = input({ status: 'IN_REVIEW', submittedBy: WRITER, canReview: true });
    expect(planPositionTransition('SEND_BACK', { ...inReview, actorUserId: REVIEWER })).toEqual(
      expect.objectContaining({ ok: false, code: 'commentRequired' }),
    );
    expect(
      planPositionTransition('SEND_BACK', {
        ...inReview,
        actorUserId: REVIEWER,
        comment: 'Add the closing date',
      }),
    ).toEqual({ ok: true, to: 'DRAFT' });
  });

  it('lets the writer take a published position back to correct it, or archive it', () => {
    const published = input({ status: 'PUBLISHED' });
    expect(planPositionTransition('TAKE_BACK', published)).toEqual({ ok: true, to: 'DRAFT' });
    expect(planPositionTransition('ARCHIVE', published)).toEqual({ ok: true, to: 'ARCHIVED' });
  });

  it('refuses a step from the wrong state', () => {
    expect(planPositionTransition('PUBLISH', input({ canReview: true }))).toEqual(
      expect.objectContaining({ ok: false, code: 'positionTransitionNotAllowed' }),
    );
    expect(planPositionTransition('ARCHIVE', input())).toEqual(
      expect.objectContaining({ ok: false, code: 'positionTransitionNotAllowed' }),
    );
  });
});
