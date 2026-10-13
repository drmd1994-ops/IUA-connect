import { type PermissionKey } from '@iua/shared';
import { type Principal } from './principal';
import {
  covers,
  coversNothing,
  holdsAnywhere,
  mayActOn,
  narrowTo,
  organisationOfNew,
  organisationWhere,
  ownedWhere,
  ownerOfNew,
  permissionsOn,
  reachedIn,
  scopeOf,
  scopeOfAny,
} from './scope';

const SOCIETY = 'org-society';
const COLLEGE = 'org-college';

function principal(
  platform: PermissionKey[],
  organisations: Record<string, PermissionKey[]> = {},
): Principal {
  return {
    userId: 'user',
    sessionId: 'session',
    mfa: true,
    roles: [],
    permissions: new Set(platform),
    organisationPermissions: new Map(
      Object.entries(organisations).map(([id, held]) => [id, new Set(held)]),
    ),
    verified: true,
    mfaEnrollmentRequired: false,
  };
}

const nobody = principal([]);
const platformEditor = principal(['news.create']);
const societyEditor = principal([], { [SOCIETY]: ['news.create'] });
const both = principal(['news.create'], { [SOCIETY]: ['news.create'] });
const twoOrganisations = principal([], { [SOCIETY]: ['news.create'], [COLLEGE]: ['news.create'] });
const superAdmin = principal(['news.create', 'membership.read', 'organisations.access']);

describe('scopeOf and covers', () => {
  it('an organisation’s staff cover that organisation’s things and nothing else', () => {
    const scope = scopeOf(societyEditor, 'news.create');
    expect(covers(scope, SOCIETY)).toBe(true);
    expect(covers(scope, COLLEGE)).toBe(false);
    expect(covers(scope, null)).toBe(false);
  });

  it('platform staff cover the platform’s own things and no organisation’s', () => {
    const scope = scopeOf(platformEditor, 'news.create');
    expect(covers(scope, null)).toBe(true);
    expect(covers(scope, SOCIETY)).toBe(false);
  });

  it('platform staff reach into organisations only with organisations.access', () => {
    const scope = scopeOf(superAdmin, 'news.create');
    expect(covers(scope, null)).toBe(true);
    expect(covers(scope, SOCIETY)).toBe(true);
    expect(covers(scope, COLLEGE)).toBe(true);
    expect(reachedIn(scope, SOCIETY)).toBe(true);
    expect(reachedIn(scope, null)).toBe(false);
  });

  it('organisations.access gives nothing without the permission itself', () => {
    const reader = principal(['organisations.access']);
    expect(covers(scopeOf(reader, 'news.create'), SOCIETY)).toBe(false);
    expect(mayActOn(reader, 'news.create', null)).toBe(false);
  });

  it('a permission held for one thing is not held for another', () => {
    expect(mayActOn(societyEditor, 'news.publish', SOCIETY)).toBe(false);
    expect(mayActOn(societyEditor, 'news.create', SOCIETY)).toBe(true);
  });

  it('own staff are not counted as reaching in', () => {
    const own = principal(['membership.read', 'organisations.access'], {
      [SOCIETY]: ['membership.read'],
    });
    const scope = scopeOf(own, 'membership.read');
    expect(reachedIn(scope, SOCIETY)).toBe(false);
    expect(reachedIn(scope, COLLEGE)).toBe(true);
  });

  it('holdsAnywhere is what opens a route; it says nothing about whose thing', () => {
    expect(holdsAnywhere(societyEditor, 'news.create')).toBe(true);
    expect(holdsAnywhere(platformEditor, 'news.create')).toBe(true);
    expect(holdsAnywhere(nobody, 'news.create')).toBe(false);
    expect(coversNothing(scopeOf(nobody, 'news.create'))).toBe(true);
    expect(coversNothing(scopeOf(societyEditor, 'news.create'))).toBe(false);
  });

  it('scopeOfAny is the widest of the permissions asked about', () => {
    const mixed = principal(['news.review'], { [SOCIETY]: ['news.create'] });
    const scope = scopeOfAny(mixed, ['news.create', 'news.review']);
    expect(covers(scope, null)).toBe(true);
    expect(covers(scope, SOCIETY)).toBe(true);
    expect(covers(scope, COLLEGE)).toBe(false);
  });
});

describe('permissionsOn', () => {
  it('for the platform’s own things: what is held on the platform', () => {
    expect([...permissionsOn(both, null)]).toEqual(['news.create']);
    expect([...permissionsOn(societyEditor, null)]).toEqual([]);
  });

  it('for an organisation’s things: what is held in it', () => {
    const reviewer = principal(['news.publish'], { [SOCIETY]: ['news.create', 'news.review'] });
    expect([...permissionsOn(reviewer, SOCIETY)].sort()).toEqual(['news.create', 'news.review']);
    expect([...permissionsOn(reviewer, COLLEGE)]).toEqual([]);
  });

  it('with organisations.access, what is held on the platform counts inside too', () => {
    expect(permissionsOn(superAdmin, COLLEGE).has('news.create')).toBe(true);
  });
});

describe('database filters', () => {
  it('ownedWhere: the platform’s rows and the organisations’ rows the scope covers', () => {
    expect(ownedWhere(scopeOf(both, 'news.create'))).toEqual({
      OR: [{ organisationId: null }, { organisationId: { in: [SOCIETY] } }],
    });
    expect(ownedWhere(scopeOf(societyEditor, 'news.create'))).toEqual({
      OR: [{ organisationId: { in: [SOCIETY] } }],
    });
    expect(ownedWhere(scopeOf(superAdmin, 'news.create'))).toEqual({});
  });

  it('a scope that covers nothing matches nothing', () => {
    expect(ownedWhere(scopeOf(nobody, 'news.create'))).toEqual({
      OR: [{ organisationId: { in: [] } }],
    });
    expect(organisationWhere(scopeOf(nobody, 'membership.read'))).toEqual({
      organisationId: { in: [] },
    });
  });

  it('organisationWhere: platform staff see no membership without organisations.access', () => {
    const platformOnly = principal(['membership.read']);
    expect(organisationWhere(scopeOf(platformOnly, 'membership.read'))).toEqual({
      organisationId: { in: [] },
    });
    expect(organisationWhere(scopeOf(superAdmin, 'membership.read'))).toEqual({});
  });
});

describe('ownerOfNew', () => {
  const scope = (who: Principal) => scopeOf(who, 'news.create');

  it('the only place the person writes for, when none is named', () => {
    expect(ownerOfNew(scope(societyEditor), undefined)).toEqual({ organisationId: SOCIETY });
    expect(ownerOfNew(scope(platformEditor), undefined)).toEqual({ organisationId: null });
  });

  it('asks which, when it could be more than one', () => {
    expect(ownerOfNew(scope(both), undefined)).toEqual({ problem: 'unsaid' });
    expect(ownerOfNew(scope(twoOrganisations), undefined)).toEqual({ problem: 'unsaid' });
  });

  it('takes the place named, when the person writes for it', () => {
    expect(ownerOfNew(scope(both), null)).toEqual({ organisationId: null });
    expect(ownerOfNew(scope(both), SOCIETY)).toEqual({ organisationId: SOCIETY });
    expect(ownerOfNew(scope(superAdmin), COLLEGE)).toEqual({ organisationId: COLLEGE });
  });

  it('refuses a place the person does not write for', () => {
    expect(ownerOfNew(scope(societyEditor), COLLEGE)).toEqual({ problem: 'notYours' });
    expect(ownerOfNew(scope(societyEditor), null)).toEqual({ problem: 'notYours' });
    expect(ownerOfNew(scope(platformEditor), SOCIETY)).toEqual({ problem: 'notYours' });
    expect(ownerOfNew(scope(nobody), undefined)).toEqual({ problem: 'notYours' });
  });
});

describe('organisationOfNew', () => {
  const scope = (who: Principal) => scopeOf(who, 'membership.manage');
  const office = principal([], { [SOCIETY]: ['membership.manage'] });
  const twoOffices = principal([], {
    [SOCIETY]: ['membership.manage'],
    [COLLEGE]: ['membership.manage'],
  });
  const support = principal(['membership.manage', 'organisations.access']);

  it('the person’s only organisation, when none is named', () => {
    expect(organisationOfNew(scope(office), undefined)).toEqual({ organisationId: SOCIETY });
  });

  it('asks which, when it could be several', () => {
    expect(organisationOfNew(scope(twoOffices), undefined)).toEqual({ problem: 'unsaid' });
    expect(organisationOfNew(scope(support), undefined)).toEqual({ problem: 'unsaid' });
  });

  it('never the platform: it has no members', () => {
    expect(organisationOfNew(scope(principal(['membership.manage'])), undefined)).toEqual({
      problem: 'notYours',
    });
  });

  it('the organisation named, when the person may act there', () => {
    expect(organisationOfNew(scope(twoOffices), COLLEGE)).toEqual({ organisationId: COLLEGE });
    expect(organisationOfNew(scope(support), COLLEGE)).toEqual({ organisationId: COLLEGE });
    expect(organisationOfNew(scope(office), COLLEGE)).toEqual({ problem: 'notYours' });
  });
});

describe('narrowTo', () => {
  const scope = scopeOf(both, 'news.create');

  it('leaves the scope whole when no owner is asked for', () => {
    expect(narrowTo(scope, undefined)).toBe(scope);
  });

  it('keeps the platform’s part, or one organisation’s', () => {
    expect(covers(narrowTo(scope, 'platform'), null)).toBe(true);
    expect(covers(narrowTo(scope, 'platform'), SOCIETY)).toBe(false);
    expect(covers(narrowTo(scope, SOCIETY), SOCIETY)).toBe(true);
    expect(covers(narrowTo(scope, SOCIETY), null)).toBe(false);
  });

  it('leaves nothing for an owner the scope does not cover', () => {
    expect(coversNothing(narrowTo(scope, COLLEGE))).toBe(true);
    expect(coversNothing(narrowTo(scopeOf(societyEditor, 'news.create'), 'platform'))).toBe(true);
  });

  it('narrows platform staff who reach in to the one organisation asked for', () => {
    const narrowed = narrowTo(scopeOf(superAdmin, 'news.create'), COLLEGE);
    expect(covers(narrowed, COLLEGE)).toBe(true);
    expect(covers(narrowed, SOCIETY)).toBe(false);
    expect(covers(narrowed, null)).toBe(false);
  });
});
