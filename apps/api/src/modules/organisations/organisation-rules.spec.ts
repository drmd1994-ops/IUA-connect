import { organisationMeant } from './organisation-rules';

const A = 'org-a';
const B = 'org-b';

describe('which organisation a request is about', () => {
  it('is the one it names, when that one is active', () => {
    expect(organisationMeant({ named: B, active: [A, B], mine: [A] })).toEqual({ id: B });
  });

  it('is unknown when it names one that is not there or not active', () => {
    expect(organisationMeant({ named: 'org-x', active: [A, B], mine: [] })).toEqual({
      problem: 'unknown',
    });
    expect(organisationMeant({ named: B, active: [A], mine: [B] })).toEqual({
      problem: 'unknown',
    });
  });

  it('is the only one, while the platform has one', () => {
    expect(organisationMeant({ named: null, active: [A], mine: [] })).toEqual({ id: A });
  });

  it('is the person’s own, when they belong to exactly one of several', () => {
    expect(organisationMeant({ named: null, active: [A, B], mine: [B] })).toEqual({ id: B });
  });

  it('must be said when it could be more than one', () => {
    expect(organisationMeant({ named: null, active: [A, B], mine: [] })).toEqual({
      problem: 'unsaid',
    });
    expect(organisationMeant({ named: null, active: [A, B], mine: [A, B] })).toEqual({
      problem: 'unsaid',
    });
  });

  it('must be said when there is none at all', () => {
    expect(organisationMeant({ named: null, active: [], mine: [] })).toEqual({
      problem: 'unsaid',
    });
  });

  it('does not count a membership in an organisation that is no longer active', () => {
    expect(organisationMeant({ named: null, active: [A, B], mine: [A, 'gone'] })).toEqual({
      id: A,
    });
  });
});
