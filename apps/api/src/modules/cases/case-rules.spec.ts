import { planReview } from './case-rules';

describe('case review (M26)', () => {
  const reviewer = { isAuthor: false, canReview: true };

  it('approves a case waiting for review, never the author’s own', () => {
    expect(planReview('APPROVE', { ...reviewer, status: 'IN_REVIEW' })).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
    expect(planReview('APPROVE', { ...reviewer, isAuthor: true, status: 'IN_REVIEW' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
      code: 'caseOwnReview',
    });
  });

  it('returns, takes back and removes only with a reason', () => {
    expect(planReview('RETURN', { ...reviewer, status: 'IN_REVIEW' })).toMatchObject({
      code: 'caseNoteRequired',
    });
    expect(
      planReview('RETURN', { ...reviewer, status: 'IN_REVIEW', note: 'Remove the date' }),
    ).toEqual({ ok: true, to: 'RETURNED' });
    expect(planReview('TAKE_BACK', { ...reviewer, status: 'PUBLISHED', note: 'x' })).toEqual({
      ok: true,
      to: 'RETURNED',
    });
    expect(planReview('REMOVE', { ...reviewer, status: 'HIDDEN', note: 'x' })).toEqual({
      ok: true,
      to: 'REMOVED',
    });
  });

  it('restores a hidden case, and keeps the case of the week published', () => {
    expect(planReview('RESTORE', { ...reviewer, status: 'HIDDEN' })).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
    expect(planReview('WEEK', { ...reviewer, status: 'PUBLISHED' })).toEqual({
      ok: true,
      to: 'PUBLISHED',
    });
    expect(planReview('WEEK', { ...reviewer, status: 'HIDDEN' })).toMatchObject({
      code: 'caseStepNotAllowed',
    });
  });

  it('refuses someone who does not review this subspecialty', () => {
    expect(
      planReview('APPROVE', { isAuthor: false, canReview: false, status: 'IN_REVIEW' }),
    ).toMatchObject({ code: 'caseNotReviewer' });
  });
});
