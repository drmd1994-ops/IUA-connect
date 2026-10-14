import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M17 step 4: what an account the platform has not verified may do (plan §2): read what is open
 * to everyone, fill in the profile, ask to be verified. Nothing else. Waiting, refused, ended by a
 * reviewer and past its date all count as not verified, and no other door opens for them.
 */
describe('an account that is not verified (integration)', () => {
  let h: Harness;
  let reviewer: { accessToken: string };
  const people: Record<string, { token: string; userId: string }> = {};
  let counter = Date.now() % 1_000_000_000;
  const newNumber = () => String(++counter);
  const NOBODY = '0190a000-0000-7000-8000-00000000c0de';

  async function person(label: string) {
    const email = await createVerifiedUser(h, label);
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: 'Tal', lastName: 'Fictional' })
      .expect(200);
    const me = await h.http().get('/api/v1/me').set(bearer(accessToken)).expect(200);
    return { token: accessToken, userId: me.body.id as string };
  }

  const ask = (token: string, licence: string) =>
    h
      .http()
      .post('/api/v1/me/verification')
      .set(bearer(token))
      .send({ kind: 'PHYSICIAN', licence })
      .expect(201);

  const decide = (id: string, body: object) =>
    h
      .http()
      .post(`/api/v1/physician-verifications/${id}/decisions`)
      .set(bearer(reviewer.accessToken))
      .send(body)
      .expect(200);

  async function approved(label: string) {
    const p = await person(label);
    const licence = newNumber();
    const sent = await ask(p.token, licence);
    await decide(sent.body.id, {
      decision: 'APPROVE',
      registerStatus: 'ACTIVE_PERMANENT',
      registerLicence: licence,
    });
    return p;
  }

  beforeAll(async () => {
    h = await startHarness();
    reviewer = await signInWithMfa(h, 'verifier', (email) => grantRole(h, email, 'VERIFIER'));

    people.neverAsked = await person('never-asked');

    people.waiting = await person('waiting');
    await ask(people.waiting.token, newNumber());

    people.refused = await person('refused');
    const refused = await ask(people.refused.token, newNumber());
    await decide(refused.body.id, { decision: 'REJECT', reason: 'Not in the register' });

    people.revoked = await approved('revoked');
    await h
      .http()
      .post(`/api/v1/physician-verifications/people/${people.revoked.userId}/revoke`)
      .set(bearer(reviewer.accessToken))
      .send({ reason: 'Licence suspended' })
      .expect(204);

    // Past its date, and the hourly job has not run yet.
    people.pastItsDate = await approved('past-its-date');
    await h.db.query(
      `UPDATE users SET verified_until = now() - interval '1 minute' WHERE id = $1`,
      [people.pastItsDate.userId],
    );

    people.verified = await approved('verified');
  });

  afterAll(async () => {
    await h.close();
  });

  const unverified = ['neverAsked', 'waiting', 'refused', 'revoked', 'pastItsDate'] as const;

  it.each(unverified)('%s: the platform does not count them as verified', async (who) => {
    const me = await h.http().get('/api/v1/me').set(bearer(people[who]!.token)).expect(200);
    expect(me.body.verified).toBe(false);
  });

  it.each(unverified)('%s: the directory, chat and rooms stay closed', async (who) => {
    const token = people[who]!.token;
    await h.http().get('/api/v1/members').set(bearer(token)).expect(403);
    await h.http().get(`/api/v1/members/${people.verified!.userId}`).set(bearer(token)).expect(403);
    await h
      .http()
      .post('/api/v1/chat/conversations')
      .set(bearer(token))
      .send({ userId: people.verified!.userId })
      .expect(403);
    await h
      .http()
      .post('/api/v1/chat/conversations')
      .set(bearer(token))
      .send({ userId: NOBODY })
      .expect(403);
    await h.http().get('/api/v1/chat/rooms').set(bearer(token)).expect(403);
    const search = await h.http().get('/api/v1/search?q=Fictional').set(bearer(token)).expect(200);
    const members = (search.body.groups as { type: string; total: number }[]).find(
      (group) => group.type === 'members',
    );
    expect(members?.total ?? 0).toBe(0);
  });

  it.each(unverified)(
    '%s: what is open to everyone, the profile and asking stay open',
    async (who) => {
      const token = people[who]!.token;
      await h.http().get('/api/v1/news').set(bearer(token)).expect(200);
      await h.http().get('/api/v1/me/profile').set(bearer(token)).expect(200);
      await h
        .http()
        .patch('/api/v1/me/profile')
        .set(bearer(token))
        .send({ bio: 'Still fictional' })
        .expect(200);
      await h.http().get('/api/v1/me/verification').set(bearer(token)).expect(200);
      await h.http().get('/api/v1/medical-schools').set(bearer(token)).expect(200);
    },
  );

  it.each(unverified)('%s: reviewing stays closed to them', async (who) => {
    await h
      .http()
      .get('/api/v1/physician-verifications')
      .set(bearer(people[who]!.token))
      .expect(403);
  });

  it('the same doors open for a verified physician', async () => {
    const token = people.verified!.token;
    const me = await h.http().get('/api/v1/me').set(bearer(token)).expect(200);
    expect(me.body.verified).toBe(true);
    await h.http().get('/api/v1/members').set(bearer(token)).expect(200);
    await h.http().get('/api/v1/chat/rooms').set(bearer(token)).expect(200);
  });
});
