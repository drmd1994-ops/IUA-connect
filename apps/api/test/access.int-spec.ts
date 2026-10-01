import { uuidv7 } from '@iua/shared';
import { type Principal } from '../src/common/auth/principal';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { AccessService } from '../src/modules/access';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  signInAdmin,
  startHarness,
} from './auth-harness';

/** M3 checkpoint 3: access tiers against real memberships. */
describe('access tiers (integration)', () => {
  let h: Harness;
  let access: AccessService;
  let admin: { accessToken: string };
  let types: Record<string, string>;

  beforeAll(async () => {
    h = await startHarness();
    access = h.app.get(AccessService);
    admin = await signInAdmin(h);
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  const principal = (userId: string) => ({ userId }) as Principal;

  /** A member with a membership of the given type; returns their user ID and membership ID. */
  async function member(typeKey: string) {
    const email = await createVerifiedUser(h, 'access');
    const res = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(admin.accessToken))
      .send({ email, typeId: types[typeKey] })
      .expect(201);
    return { userId: res.body.membership.member.userId as string, id: res.body.membership.id };
  }

  it('counts only active memberships', async () => {
    expect(await access.viewerOf(null)).toEqual({ activeTypeId: null });
    const nobody = await createVerifiedUser(h, 'no-membership');
    const { rows } = await h.db.query('SELECT id FROM users WHERE email = $1', [nobody]);
    expect(await access.viewerOf(principal(rows[0].id))).toEqual({ activeTypeId: null });

    const active = await member('STUDENT');
    expect(await access.viewerOf(principal(active.userId))).toEqual({
      activeTypeId: types.STUDENT,
    });

    const suspended = await member('STUDENT');
    await h
      .http()
      .post(`/api/v1/admin/memberships/${suspended.id}/suspend`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Test' })
      .expect(200);
    expect(await access.viewerOf(principal(suspended.userId))).toEqual({ activeTypeId: null });

    const expired = await member('STUDENT');
    await h.db.query(
      `UPDATE memberships SET start_date = DATE '2024-01-01', end_date = DATE '2024-12-31' WHERE id = $1`,
      [expired.id],
    );
    expect(await access.viewerOf(principal(expired.userId))).toEqual({ activeTypeId: null });
  });

  it('stores TYPES rules and turns them into a list filter', async () => {
    const itemId = uuidv7();
    const prisma = h.app.get(PrismaService);
    await prisma.$transaction((tx) =>
      access.setRules(tx, 'news', itemId, 'TYPES', [types.FULL_MEMBER!, types.FULL_MEMBER!]),
    );
    expect(await access.allowedTypes('news', itemId)).toEqual([types.FULL_MEMBER]);

    const full = { activeTypeId: types.FULL_MEMBER! };
    expect(await access.canSeeItem('news', { id: itemId, accessTier: 'TYPES' }, full)).toBe(true);
    expect(
      await access.canSeeItem(
        'news',
        { id: itemId, accessTier: 'TYPES' },
        {
          activeTypeId: types.STUDENT!,
        },
      ),
    ).toBe(false);
    // Other tests' items may be in the list too (shared test database).
    expect((await access.visibleWhere('news', full)).OR).toContainEqual({
      id: { in: expect.arrayContaining([itemId]) },
    });
    expect(await access.visibleWhere('news', { activeTypeId: null })).toEqual({
      OR: [{ accessTier: 'PUBLIC' }],
    });

    // Changing the tier away from TYPES removes the rules.
    await prisma.$transaction((tx) => access.setRules(tx, 'news', itemId, 'MEMBERS', []));
    expect(await access.allowedTypes('news', itemId)).toEqual([]);
  });
});
