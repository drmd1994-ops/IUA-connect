import {
  ANONYMOUS,
  type AccessTier,
  type Viewer,
  canSee,
  isMemberOf,
  tierFitsOwner,
} from './access-policy';

const SOCIETY = 'org-society';
const COLLEGE = 'org-college';
const FULL = 'society-full';
const STUDENT = 'society-student';
const FELLOW = 'college-fellow';

/** Everything a reader can be, as the service reduces it. */
const viewers: Record<string, Viewer> = {
  anonymous: ANONYMOUS,
  'signed in, not verified': { verified: false, memberships: [] },
  'verified, in no organisation': { verified: true, memberships: [] },
  'verified, membership suspended or expired': { verified: true, memberships: [] },
  'full member of the society': {
    verified: true,
    memberships: [{ organisationId: SOCIETY, typeId: FULL }],
  },
  'student member of the society': {
    verified: true,
    memberships: [{ organisationId: SOCIETY, typeId: STUDENT }],
  },
  'fellow of the college': {
    verified: true,
    memberships: [{ organisationId: COLLEGE, typeId: FELLOW }],
  },
  'member of both': {
    verified: true,
    memberships: [
      { organisationId: SOCIETY, typeId: STUDENT },
      { organisationId: COLLEGE, typeId: FELLOW },
    ],
  },
};

type Row = Record<AccessTier, boolean>;

/** The society's item; its TYPES setting names full members only. */
const societyItem: Record<string, Row> = {
  anonymous: { PUBLIC: true, VERIFIED: false, MEMBERS: false, TYPES: false },
  'signed in, not verified': { PUBLIC: true, VERIFIED: false, MEMBERS: false, TYPES: false },
  'verified, in no organisation': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: false },
  'verified, membership suspended or expired': {
    PUBLIC: true,
    VERIFIED: true,
    MEMBERS: false,
    TYPES: false,
  },
  'full member of the society': { PUBLIC: true, VERIFIED: true, MEMBERS: true, TYPES: true },
  'student member of the society': { PUBLIC: true, VERIFIED: true, MEMBERS: true, TYPES: false },
  'fellow of the college': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: false },
  'member of both': { PUBLIC: true, VERIFIED: true, MEMBERS: true, TYPES: false },
};

/** The platform's own item; its TYPES setting names the college's fellows. */
const platformItem: Record<string, Row> = {
  anonymous: { PUBLIC: true, VERIFIED: false, MEMBERS: false, TYPES: false },
  'signed in, not verified': { PUBLIC: true, VERIFIED: false, MEMBERS: false, TYPES: false },
  'verified, in no organisation': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: false },
  'verified, membership suspended or expired': {
    PUBLIC: true,
    VERIFIED: true,
    MEMBERS: false,
    TYPES: false,
  },
  'full member of the society': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: false },
  'student member of the society': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: false },
  'fellow of the college': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: true },
  'member of both': { PUBLIC: true, VERIFIED: true, MEMBERS: false, TYPES: true },
};

const TIERS = ['PUBLIC', 'VERIFIED', 'MEMBERS', 'TYPES'] as const;

describe('canSee', () => {
  for (const [who, viewer] of Object.entries(viewers)) {
    for (const accessTier of TIERS) {
      it(`the society's ${accessTier} item, ${who}: ${societyItem[who]![accessTier] ? 'visible' : 'hidden'}`, () => {
        expect(canSee(viewer, { accessTier, organisationId: SOCIETY }, [FULL])).toBe(
          societyItem[who]![accessTier],
        );
      });
      it(`the platform's ${accessTier} item, ${who}: ${platformItem[who]![accessTier] ? 'visible' : 'hidden'}`, () => {
        expect(canSee(viewer, { accessTier, organisationId: null }, [FELLOW])).toBe(
          platformItem[who]![accessTier],
        );
      });
    }
  }

  it('hides a TYPES item that allows no type from everyone', () => {
    const viewer = viewers['member of both']!;
    expect(canSee(viewer, { accessTier: 'TYPES', organisationId: SOCIETY }, [])).toBe(false);
  });
});

describe('tierFitsOwner', () => {
  it('lets an organisation use every setting', () => {
    for (const tier of TIERS) expect(tierFitsOwner(tier, SOCIETY)).toBe(true);
  });

  it('keeps "members" from the platform, which has none', () => {
    expect(tierFitsOwner('MEMBERS', null)).toBe(false);
    for (const tier of ['PUBLIC', 'VERIFIED', 'TYPES'] as const) {
      expect(tierFitsOwner(tier, null)).toBe(true);
    }
  });
});

describe('isMemberOf', () => {
  it('is about one organisation', () => {
    const fellow = viewers['fellow of the college']!;
    expect(isMemberOf(fellow, COLLEGE)).toBe(true);
    expect(isMemberOf(fellow, SOCIETY)).toBe(false);
    expect(isMemberOf(ANONYMOUS, SOCIETY)).toBe(false);
  });
});
