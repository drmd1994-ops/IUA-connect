import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
  verifyPhysician,
} from './auth-harness';

interface Person {
  id: string;
  email: string;
  accessToken: string;
}

/** M28: mentors and mentorship requests. Everyone here is fictional. */
describe('mentorship (integration)', () => {
  let h: Harness;
  let subspecialties: { id: string; key: string }[];
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    subspecialties = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items;
  });

  afterAll(async () => {
    await h.close();
  });

  /** A signed-in person with a name; verified as `as`, or not verified. */
  async function person(
    verifiedAs: 'SPECIALIST' | 'RESIDENT' | null = 'RESIDENT',
  ): Promise<Person> {
    const email = await createVerifiedUser(h, 'mentorship');
    if (verifiedAs) {
      await verifyPhysician(h, email);
      await h.db.query('UPDATE users SET verified_as = $2 WHERE email = $1', [email, verifiedAs]);
    }
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: `Name${run}${++n}`, lastName: 'Fictional' })
      .expect(200);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { id: rows[0]!.id, email, accessToken };
  }

  const settings = (extra: Record<string, unknown> = {}) => ({
    open: true,
    subspecialtyIds: [subspecialties[2]!.id],
    academicInterests: `Made-up research interest ${run}`,
    careerInterests: 'Academic careers',
    availability: 'One call a month',
    languages: ['he', 'en'],
    capacity: 2,
    ...extra,
  });

  async function mentor(extra: Record<string, unknown> = {}): Promise<Person> {
    const who = await person('SPECIALIST');
    await h
      .http()
      .put('/api/v1/mentorship/settings')
      .set(as(who))
      .send(settings(extra))
      .expect(200);
    return who;
  }

  const ask = (mentee: Person, mentorId: string) =>
    h
      .http()
      .post('/api/v1/mentorship/requests')
      .set(as(mentee))
      .send({ mentorId, message: 'I am a resident and would like advice on research.' });
  const act = (who: Person, id: string, action: string) =>
    h.http().post(`/api/v1/mentorship/requests/${id}/${action}`).set(as(who));
  const mentorIds = async (who: Person, query: object = {}) =>
    (
      await h.http().get('/api/v1/mentorship/mentors').set(as(who)).query(query).expect(200)
    ).body.items.map((m: { person: { id: string } }) => m.person.id) as string[];
  const notices = async (userId: string, type: string) =>
    (
      await h.db.query('SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2', [
        userId,
        type,
      ])
    ).rowCount;

  it('shows mentors to verified people only', async () => {
    await h.http().get('/api/v1/mentorship/mentors').expect(401);
    const unverified = await person(null);
    const res = await h.http().get('/api/v1/mentorship/mentors').set(as(unverified)).expect(403);
    expect(res.body.error.details[0].code).toBe('membersOnly');
  });

  it('lets only verified specialists offer mentorship', async () => {
    const resident = await person('RESIDENT');
    const mine = await h.http().get('/api/v1/mentorship/settings').set(as(resident)).expect(200);
    expect(mine.body).toEqual({ eligible: false, settings: null, active: 0 });
    const res = await h
      .http()
      .put('/api/v1/mentorship/settings')
      .set(as(resident))
      .send(settings())
      .expect(403);
    expect(res.body.error.details[0].code).toBe('mentorOnlySpecialists');
  });

  it('lists a mentor while they choose to be listed, with filters', async () => {
    const m = await mentor({ languages: ['ru'] });
    const mentee = await person();
    expect(await mentorIds(mentee, { q: `interest ${run}` })).toContain(m.id);
    expect(await mentorIds(mentee, { language: 'ru' })).toContain(m.id);
    expect(await mentorIds(mentee, { subspecialty: subspecialties[2]!.key })).toContain(m.id);
    expect(await mentorIds(mentee, { subspecialty: subspecialties[3]!.key })).not.toContain(m.id);
    // A mentor does not see themselves.
    expect(await mentorIds(m, { language: 'ru' })).not.toContain(m.id);

    await h
      .http()
      .put('/api/v1/mentorship/settings')
      .set(as(m))
      .send(settings({ open: false, languages: ['ru'] }))
      .expect(200);
    expect(await mentorIds(mentee, { language: 'ru' })).not.toContain(m.id);
  });

  it('opens a conversation when a mentor accepts, outside the directory', async () => {
    const m = await mentor();
    const mentee = await person();
    const request = (await ask(mentee, m.id).expect(201)).body;
    expect(request).toMatchObject({ role: 'mentee', state: 'PENDING', conversationId: null });
    expect(await notices(m.id, 'mentorshipRequested')).toBe(1);

    const listed = await h.http().get('/api/v1/mentorship/mentors').set(as(mentee));
    const card = listed.body.items.find((x: { person: { id: string } }) => x.person.id === m.id);
    expect(card.mine).toEqual({ id: request.id, state: 'PENDING' });

    const theirs = await h.http().get('/api/v1/mentorship/requests').set(as(m)).expect(200);
    expect(theirs.body.items[0]).toMatchObject({
      id: request.id,
      role: 'mentor',
      other: { id: mentee.id },
      message: expect.any(String),
    });
    // The mentee can't answer their own request.
    await act(mentee, request.id, 'accept').expect(422);

    const accepted = (await act(m, request.id, 'accept').expect(200)).body;
    expect(accepted.state).toBe('ACCEPTED');
    expect(accepted.conversationId).toEqual(expect.any(String));
    expect(await notices(mentee.id, 'mentorshipAccepted')).toBe(1);

    // Neither is listed in the directory, and they can write to each other.
    await h
      .http()
      .post(`/api/v1/chat/conversations/${accepted.conversationId}/messages`)
      .set(as(mentee))
      .send({ body: 'Thank you!' })
      .expect(201);
    await h
      .http()
      .post(`/api/v1/chat/conversations/${accepted.conversationId}/messages`)
      .set(as(m))
      .send({ body: 'Glad to help.' })
      .expect(201);

    // Either side ends it; the other is told.
    await act(mentee, request.id, 'end').expect(200);
    expect(await notices(m.id, 'mentorshipEnded')).toBe(1);
  });

  it('keeps a request between its two people', async () => {
    const m = await mentor();
    const mentee = await person();
    const request = (await ask(mentee, m.id).expect(201)).body;
    const stranger = await person();
    await act(stranger, request.id, 'accept').expect(404);
    await act(stranger, request.id, 'withdraw').expect(404);
    const admin = await signInAdmin(h, 'mentorship-admin');
    const seen = await h.http().get('/api/v1/mentorship/requests').set(as(admin)).expect(200);
    expect(seen.body.items).toEqual([]);
  });

  it('allows 3 waiting requests at a time', async () => {
    const mentee = await person();
    // One after another: signing several people up at the same moment drops connections.
    const mentors: Person[] = [];
    for (let i = 0; i < 4; i++) mentors.push(await mentor());
    for (const m of mentors.slice(0, 3)) await ask(mentee, m.id).expect(201);
    const fourth = await ask(mentee, mentors[3]!.id).expect(422);
    expect(fourth.body.error.details[0].code).toBe('mentorshipTooManyWaiting');
    // Withdrawing one makes room.
    const mine = await h.http().get('/api/v1/mentorship/requests').set(as(mentee));
    await act(mentee, mine.body.items[0].id, 'withdraw').expect(200);
    await ask(mentee, mentors[3]!.id).expect(201);
  });

  it('waits 30 days after a decline, and tells the mentee without a reason', async () => {
    const m = await mentor();
    const mentee = await person();
    const request = (await ask(mentee, m.id).expect(201)).body;
    await act(m, request.id, 'decline').expect(200);
    expect(await notices(mentee.id, 'mentorshipDeclined')).toBe(1);
    const again = await ask(mentee, m.id).expect(422);
    expect(again.body.error.details[0].code).toBe('mentorshipAskedRecently');
    await h.db.query(
      "UPDATE mentorships SET answered_at = now() - interval '31 days' WHERE id = $1",
      [request.id],
    );
    await ask(mentee, m.id).expect(201);
  });

  it('refuses a mentor at their limit of mentees', async () => {
    const m = await mentor({ capacity: 1 });
    const first = await person();
    const second = await person();
    const one = (await ask(first, m.id).expect(201)).body;
    const two = (await ask(second, m.id).expect(201)).body;
    await act(m, one.id, 'accept').expect(200);
    const full = await act(m, two.id, 'accept').expect(422);
    expect(full.body.error.details[0].code).toBe('mentorFull');
    const listed = await h
      .http()
      .get('/api/v1/mentorship/mentors')
      .set(as(await person()));
    const card = listed.body.items.find((x: { person: { id: string } }) => x.person.id === m.id);
    expect(card.taking).toBe(false);
    const third = await ask(await person(), m.id).expect(422);
    expect(third.body.error.details[0].code).toBe('mentorFull');
  });

  it('keeps blocked people apart', async () => {
    const m = await mentor();
    const mentee = await person();
    // Chat blocks only people one talks with; a block from an earlier conversation stands.
    await h.db.query('INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
      m.id,
      mentee.id,
    ]);
    expect(await mentorIds(mentee)).not.toContain(m.id);
    await ask(mentee, m.id).expect(404);
  });

  it('closes a request left unanswered for 30 days', async () => {
    const m = await mentor();
    const mentee = await person();
    const request = (await ask(mentee, m.id).expect(201)).body;
    await h.db.query(
      "UPDATE mentorships SET created_at = now() - interval '31 days' WHERE id = $1",
      [request.id],
    );
    const mine = await h.http().get('/api/v1/mentorship/requests').set(as(mentee)).expect(200);
    expect(mine.body.items.find((r: { id: string }) => r.id === request.id).state).toBe('EXPIRED');
    expect(await notices(mentee.id, 'mentorshipExpired')).toBe(1);
  });
});
