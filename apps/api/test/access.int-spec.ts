import { uuidv7 } from '@medconnect/shared';
import { type Principal } from '../src/common/auth/principal';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AccessService } from '../src/modules/access';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createOrganisation,
  createVerifiedUser,
  signInAdmin,
  signInOrganisationAdmin,
  startHarness,
  verifyPhysician,
} from './auth-harness';

/** M3 checkpoint 3, M16: the access tiers against real accounts and memberships. */
describe('access tiers (integration)', () => {
  let h: Harness;
  let access: AccessService;
  let admin: { accessToken: string };
  let types: Record<string, string>;

  beforeAll(async () => {
    h = await startHarness();
    access = h.app.get(AccessService);
    admin = await signInAdmin(h);
    const res = await h
      .http()
      .get(`/api/v1/membership-types?organisation=${DEFAULT_ORGANISATION}`)
      .expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  /** The principal as the resolver would make it, as far as the viewer needs. */
  async function principal(userId: string): Promise<Principal> {
    const { rows } = await h.db.query<{ verified: boolean }>(
      'SELECT verified_at IS NOT NULL AS verified FROM users WHERE id = $1',
      [userId],
    );
    return { userId, verified: rows[0]!.verified } as Principal;
  }

  async function userId(email: string): Promise<string> {
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return rows[0]!.id;
  }

  /** A member of the default organisation; returns their user ID and membership ID. */
  async function member(typeKey: string) {
    const email = await createVerifiedUser(h, 'access');
    const res = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(admin.accessToken))
      .send({ email, typeId: types[typeKey] })
      .expect(201);
    return {
      email,
      userId: res.body.membership.member.userId as string,
      id: res.body.membership.id as string,
    };
  }

  const inDefault = (typeKey: string) => [
    { organisationId: DEFAULT_ORGANISATION, typeId: types[typeKey] },
  ];

  it('an anonymous reader and a new account are neither verified nor members', async () => {
    expect(await access.viewerOf(null)).toEqual({ verified: false, memberships: [] });
    const nobody = await userId(await createVerifiedUser(h, 'no-membership'));
    expect(await access.viewerOf(await principal(nobody))).toEqual({
      verified: false,
      memberships: [],
    });
  });

  it('a verified person in no organisation is verified, and a member of none', async () => {
    const email = await createVerifiedUser(h, 'verified');
    await verifyPhysician(h, email);
    expect(await access.viewerOf(await principal(await userId(email)))).toEqual({
      verified: true,
      memberships: [],
    });
  });

  it('counts only active memberships, and keeps the person verified when one ends', async () => {
    const active = await member('STUDENT');
    // Whoever an organisation accepts as a member is known to the platform as a physician.
    expect(await access.viewerOf(await principal(active.userId))).toEqual({
      verified: true,
      memberships: inDefault('STUDENT'),
    });

    const suspended = await member('STUDENT');
    await h
      .http()
      .post(`/api/v1/admin/memberships/${suspended.id}/suspend`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Test' })
      .expect(200);
    expect(await access.viewerOf(await principal(suspended.userId))).toEqual({
      verified: true,
      memberships: [],
    });

    const expired = await member('STUDENT');
    await h.db.query(
      `UPDATE memberships SET start_date = DATE '2024-01-01', end_date = DATE '2024-12-31' WHERE id = $1`,
      [expired.id],
    );
    expect(await access.viewerOf(await principal(expired.userId))).toEqual({
      verified: true,
      memberships: [],
    });
    // The same for someone other than the caller.
    expect(await access.viewerOfUser(expired.userId)).toEqual({ verified: true, memberships: [] });
    expect(await access.viewerOfUser(active.userId)).toEqual({
      verified: true,
      memberships: inDefault('STUDENT'),
    });
  });

  it('a person may be a member of two organisations, each on its own', async () => {
    const other = await createOrganisation(h, 'access');
    const office = await signInOrganisationAdmin(h, other.id);
    const both = await member('STUDENT');
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(office.accessToken))
      .send({ email: both.email, typeId: other.typeId })
      .expect(201);
    const viewer = await access.viewerOf(await principal(both.userId));
    expect(viewer.verified).toBe(true);
    expect([...viewer.memberships].sort((a, b) => a.typeId.localeCompare(b.typeId))).toEqual(
      [
        { organisationId: DEFAULT_ORGANISATION, typeId: types.STUDENT },
        { organisationId: other.id, typeId: other.typeId },
      ].sort((a, b) => a.typeId!.localeCompare(b.typeId!)),
    );

    // Members-only items: of one's own organisation, never of another.
    const society = { id: uuidv7(), accessTier: 'MEMBERS' as const };
    const onlyDefault = await access.viewerOf(await principal((await member('STUDENT')).userId));
    expect(
      await access.canSeeItem('news', { ...society, organisationId: other.id }, onlyDefault),
    ).toBe(false);
    expect(
      await access.canSeeItem(
        'news',
        { ...society, organisationId: DEFAULT_ORGANISATION },
        onlyDefault,
      ),
    ).toBe(true);
    expect(await access.canSeeItem('news', { ...society, organisationId: other.id }, viewer)).toBe(
      true,
    );

    // An organisation that is no longer active counts for nothing.
    await h.db.query('UPDATE organisations SET active = false WHERE id = $1', [other.id]);
    expect((await access.viewerOf(await principal(both.userId))).memberships).toEqual(
      inDefault('STUDENT'),
    );
  });

  it('stores TYPES rules and turns them into a list filter', async () => {
    const itemId = uuidv7();
    const prisma = h.app.get(PrismaService);
    await prisma.$transaction((tx) =>
      access.setRules(tx, 'news', itemId, 'TYPES', [types.FULL_MEMBER!, types.FULL_MEMBER!]),
    );
    expect(await access.allowedTypes('news', itemId)).toEqual([types.FULL_MEMBER]);

    const full = { verified: true, memberships: inDefault('FULL_MEMBER') } as const;
    const student = { verified: true, memberships: inDefault('STUDENT') } as const;
    const item = { id: itemId, accessTier: 'TYPES' as const, organisationId: DEFAULT_ORGANISATION };
    expect(await access.canSeeItem('news', item, full as never)).toBe(true);
    expect(await access.canSeeItem('news', item, student as never)).toBe(false);
    // Other tests' items may be in the list too (shared test database).
    const filter = await access.visibleWhere('news', full as never);
    expect(filter.OR).toContainEqual({ id: { in: expect.arrayContaining([itemId]) } });
    expect(filter.OR).toContainEqual({
      accessTier: 'MEMBERS',
      organisationId: { in: [DEFAULT_ORGANISATION] },
    });
    expect(filter.OR).toContainEqual({ accessTier: 'VERIFIED' });

    // Changing the tier away from TYPES removes the rules.
    await prisma.$transaction((tx) => access.setRules(tx, 'news', itemId, 'MEMBERS', []));
    expect(await access.allowedTypes('news', itemId)).toEqual([]);
  });

  it('filters lists by what the reader is', async () => {
    expect(await access.visibleWhere('news', { verified: false, memberships: [] })).toEqual({
      OR: [{ accessTier: 'PUBLIC' }],
    });
    expect(await access.visibleWhere('news', { verified: true, memberships: [] })).toEqual({
      OR: [{ accessTier: 'PUBLIC' }, { accessTier: 'VERIFIED' }],
    });
    // The platform's own content has no members: there is no "members" branch for it.
    const student = { verified: true, memberships: inDefault('STUDENT') };
    const library = await access.visibleWhere('education', student as never);
    expect(library.OR).not.toContainEqual(expect.objectContaining({ accessTier: 'MEMBERS' }));
    expect(library.OR).toContainEqual({ accessTier: 'VERIFIED' });
  });

  it('tells which membership types an owner’s item may name', async () => {
    const other = await createOrganisation(h, 'types');
    expect(await access.typesNotOf(DEFAULT_ORGANISATION, [types.STUDENT!])).toEqual([]);
    expect(await access.typesNotOf(DEFAULT_ORGANISATION, [types.STUDENT!, other.typeId])).toEqual([
      other.typeId,
    ]);
    // The platform's own item may name any organisation's types.
    expect(await access.typesNotOf(null, [types.STUDENT!, other.typeId])).toEqual([]);
    expect(await access.typesNotOf(null, [uuidv7()])).toHaveLength(1);
  });
});
