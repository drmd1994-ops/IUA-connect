import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';

/** M2 checkpoint 5: the digital card's QR token and the public verification. */
describe('membership card (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let honoraryTypeId: string;

  beforeAll(async () => {
    h = await startHarness({ rateLimits: true });
    admin = await signInAdmin(h);
    const types = await h.http().get('/api/v1/membership-types').expect(200);
    honoraryTypeId = (types.body.items as { key: string; id: string }[]).find(
      (t) => t.key === 'HONORARY_MEMBER',
    )!.id;
  });

  afterAll(async () => {
    await h.close();
  });

  async function memberWithCard() {
    const email = await createVerifiedUser(h, 'card');
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: 'Yael', lastName: 'Fictional' })
      .expect(200);
    const created = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(admin.accessToken))
      .send({ email, typeId: honoraryTypeId })
      .expect(201);
    return { email, accessToken, membershipId: created.body.membership.id as string };
  }

  const cardToken = (accessToken: string) =>
    h.http().get('/api/v1/me/membership/card-token').set(bearer(accessToken));
  const verify = (t: string) =>
    h.http().get('/api/v1/card/verify').query({ t }).set('X-Forwarded-For', '203.0.113.9');

  it('issues a short-lived token that anyone can verify', async () => {
    const { accessToken, membershipId } = await memberWithCard();
    const res = await cardToken(accessToken).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const check = await h
      .http()
      .get('/api/v1/card/verify')
      .query({ t: res.body.token })
      .expect(200);
    expect(check.headers['cache-control']).toBe('no-store');
    expect(check.body).toEqual({
      valid: true,
      name: 'Yael Fictional',
      // Whose card it is.
      organisation: {
        id: DEFAULT_ORGANISATION,
        slug: expect.any(String),
        nameHe: expect.any(String),
        nameEn: expect.any(String),
      },
      type: { key: 'HONORARY_MEMBER', nameHe: 'חברות כבוד', nameEn: 'Honorary member' },
    });

    // Suspending the membership invalidates the card at once, even an unexpired token.
    await h
      .http()
      .post(`/api/v1/admin/memberships/${membershipId}/suspend`)
      .set(bearer(admin.accessToken))
      .send({ reason: 'Test' })
      .expect(200);
    const after = await h
      .http()
      .get('/api/v1/card/verify')
      .query({ t: res.body.token })
      .expect(200);
    expect(after.body).toEqual({ valid: false, name: null, organisation: null, type: null });
    await cardToken(accessToken).expect(422);
  });

  it('needs a signed-in member with an active membership', async () => {
    await h.http().get('/api/v1/me/membership/card-token').expect(401);
    const email = await createVerifiedUser(h, 'no-card');
    const { accessToken } = await signIn(h, email);
    await cardToken(accessToken).expect(422);
    // An access token is not a card.
    const res = await h.http().get('/api/v1/card/verify').query({ t: accessToken }).expect(200);
    expect(res.body.valid).toBe(false);
    await h.http().get('/api/v1/card/verify').expect(400);
  });

  it('limits verification to 60 checks a minute per IP', async () => {
    for (let i = 0; i < 60; i++) await verify('x').expect(200);
    await verify('x').expect(429);
  });
});
