import {
  type Harness,
  STRONG_PASSWORD,
  createVerifiedUser,
  startHarness,
  uniqueEmail,
} from './auth-harness';

/** API_DESIGN.md §5 limits, against the real endpoints and the in-memory store. */
describe('identity: rate limits', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness({ rateLimits: true }); // fresh counters per test
  });

  afterEach(async () => {
    await h.close();
  });

  it('limits sign-in to 5 attempts per account per minute (before the lockout even applies)', async () => {
    const email = await createVerifiedUser(h, 'rl-account');
    for (let i = 0; i < 5; i++) {
      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong passphrase x' })
        .expect(401);
    }
    const res = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: STRONG_PASSWORD })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits registration to 5 per IP per hour', async () => {
    for (let i = 0; i < 5; i++) {
      await h
        .http()
        .post('/api/v1/auth/register')
        .send({ email: uniqueEmail('rl-reg'), password: STRONG_PASSWORD })
        .expect(202);
    }
    await h
      .http()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail('rl-reg'), password: STRONG_PASSWORD })
      .expect(429);
  });
});
