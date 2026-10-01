import { ANONYMOUS, type AccessTier, type Viewer, canSee } from './access-policy';

const FULL = 'type-full';
const STUDENT = 'type-student';

/** Every membership state a reader can be in, as the service reduces it. */
const viewers: Record<string, Viewer> = {
  anonymous: ANONYMOUS,
  'signed in, no membership': { activeTypeId: null },
  'suspended or expired member': { activeTypeId: null },
  'active full member': { activeTypeId: FULL },
  'active student': { activeTypeId: STUDENT },
};

const expected: Record<string, Record<AccessTier, boolean>> = {
  anonymous: { PUBLIC: true, MEMBERS: false, TYPES: false },
  'signed in, no membership': { PUBLIC: true, MEMBERS: false, TYPES: false },
  'suspended or expired member': { PUBLIC: true, MEMBERS: false, TYPES: false },
  'active full member': { PUBLIC: true, MEMBERS: true, TYPES: true },
  'active student': { PUBLIC: true, MEMBERS: true, TYPES: false },
};

describe('canSee', () => {
  for (const [who, viewer] of Object.entries(viewers)) {
    for (const tier of ['PUBLIC', 'MEMBERS', 'TYPES'] as const) {
      it(`${tier} item, ${who}: ${expected[who]![tier] ? 'visible' : 'hidden'}`, () => {
        // TYPES items here allow full members only.
        expect(canSee(viewer, tier, [FULL])).toBe(expected[who]![tier]);
      });
    }
  }

  it('hides a TYPES item that allows no type from everyone', () => {
    expect(canSee({ activeTypeId: FULL }, 'TYPES', [])).toBe(false);
  });
});
