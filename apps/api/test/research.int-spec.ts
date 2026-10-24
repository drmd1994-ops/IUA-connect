import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  startHarness,
  verifyPhysician,
} from './auth-harness';

interface Person {
  id: string;
  email: string;
  accessToken: string;
}

/** M27: research projects and publications. Everyone and everything here is made up. */
describe('research and publications (integration)', () => {
  let h: Harness;
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.close();
  });

  async function person(
    verifiedAs: 'SPECIALIST' | 'RESIDENT' | 'STUDENT' | null = 'SPECIALIST',
  ): Promise<Person> {
    const email = await createVerifiedUser(h, 'research');
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

  const project = (extra: Record<string, unknown> = {}) => ({
    title: `A made-up registry ${run}-${++n}`,
    description: 'A multicentre registry looking for two more centres.',
    studyType: 'REGISTRY',
    ethics: 'SUBMITTED',
    needs: ['CENTRES'],
    ...extra,
  });
  const list = (who: Person, query: Record<string, unknown> = {}) =>
    h.http().get('/api/v1/research/projects').set(as(who)).query(query).expect(200);
  const notices = async (userId: string, type: string) =>
    (
      await h.db.query('SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2', [
        userId,
        type,
      ])
    ).rowCount;

  it('lets verified physicians list projects; students ask, unverified people see nothing', async () => {
    const student = await person('STUDENT');
    const refused = await h
      .http()
      .post('/api/v1/research/projects')
      .set(as(student))
      .send(project())
      .expect(403);
    expect(refused.body.error.details[0].code).toBe('researchPhysiciansOnly');
    const unverified = await person(null);
    await h.http().get('/api/v1/research/projects').set(as(unverified)).expect(403);

    const resident = await person('RESIDENT');
    const created = await h
      .http()
      .post('/api/v1/research/projects')
      .set(as(resident))
      .send(project())
      .expect(201);
    expect(created.body).toMatchObject({ mine: true, open: true, stale: false });
    expect(created.body.groupId).toEqual(expect.any(String));
  });

  it('refuses a patient’s details in a project', async () => {
    const lead = await person();
    const res = await h
      .http()
      .post('/api/v1/research/projects')
      .set(as(lead))
      .send(project({ description: 'Contact the patient at 052-1234567.' }))
      .expect(400);
    expect(res.body.error.details[0]).toMatchObject({ code: 'patientPhone' });
  });

  it('finds projects by words and filters', async () => {
    const lead = await person();
    const word = `kiwifruit${run}`;
    const made = (
      await h
        .http()
        .post('/api/v1/research/projects')
        .set(as(lead))
        .send(project({ title: `Trial of ${word}`, studyType: 'TRIAL', needs: ['STATISTICIAN'] }))
        .expect(201)
    ).body;
    const reader = await person('RESIDENT');
    const ids = async (query: Record<string, unknown>) =>
      (await list(reader, { q: word, ...query })).body.items.map((p: { id: string }) => p.id);
    expect(await ids({})).toEqual([made.id]);
    expect(await ids({ studyType: 'TRIAL', need: 'STATISTICIAN' })).toEqual([made.id]);
    expect(await ids({ studyType: 'SURVEY' })).toEqual([]);
  });

  it('accepting a request adds the person to the project’s group', async () => {
    const lead = await person();
    const asker = await person('RESIDENT');
    const made = (
      await h.http().post('/api/v1/research/projects').set(as(lead)).send(project()).expect(201)
    ).body;
    const request = (
      await h
        .http()
        .post(`/api/v1/research/projects/${made.id}/requests`)
        .set(as(asker))
        .send({ message: 'I can bring our centre.' })
        .expect(201)
    ).body;
    expect(await notices(lead.id, 'researchRequested')).toBe(1);
    // The asker can't answer their own request; the group isn't theirs yet.
    await h
      .http()
      .post(`/api/v1/research/requests/${request.id}/accept`)
      .set(as(asker))
      .expect(422);
    const before = await h.http().get(`/api/v1/research/projects/${made.id}`).set(as(asker));
    expect(before.body).toMatchObject({ groupId: null, myRequest: { state: 'PENDING' } });

    await h.http().post(`/api/v1/research/requests/${request.id}/accept`).set(as(lead)).expect(200);
    expect(await notices(asker.id, 'researchAccepted')).toBe(1);
    const after = await h.http().get(`/api/v1/research/projects/${made.id}`).set(as(asker));
    expect(after.body).toMatchObject({ groupId: made.groupId, members: 1 });
    const { rowCount } = await h.db.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [made.groupId, asker.id],
    );
    expect(rowCount).toBe(1);
  });

  it('keeps requests between their two people, with the limits', async () => {
    const lead = await person();
    const asker = await person('STUDENT');
    const made = (
      await h.http().post('/api/v1/research/projects').set(as(lead)).send(project()).expect(201)
    ).body;
    const ask = () =>
      h
        .http()
        .post(`/api/v1/research/projects/${made.id}/requests`)
        .set(as(asker))
        .send({ message: 'May I help with data collection?' });
    const request = (await ask().expect(201)).body;
    const again = await ask().expect(422);
    expect(again.body.error.details[0].code).toBe('researchAlreadyOpen');
    const stranger = await person();
    await h
      .http()
      .post(`/api/v1/research/requests/${request.id}/decline`)
      .set(as(stranger))
      .expect(404);
    await h
      .http()
      .post(`/api/v1/research/requests/${request.id}/decline`)
      .set(as(lead))
      .expect(200);
    expect(await notices(asker.id, 'researchDeclined')).toBe(1);
    const soon = await ask().expect(422);
    expect(soon.body.error.details[0].code).toBe('researchAskedRecently');
    const own = await h
      .http()
      .post(`/api/v1/research/projects/${made.id}/requests`)
      .set(as(lead))
      .send({ message: 'Me' })
      .expect(422);
    expect(own.body.error.details[0].code).toBe('researchOwnProject');
  });

  it('closes a request after 30 days, and marks a project not confirmed for a year', async () => {
    const lead = await person();
    const asker = await person('RESIDENT');
    const made = (
      await h.http().post('/api/v1/research/projects').set(as(lead)).send(project()).expect(201)
    ).body;
    const request = (
      await h
        .http()
        .post(`/api/v1/research/projects/${made.id}/requests`)
        .set(as(asker))
        .send({ message: 'Interested.' })
        .expect(201)
    ).body;
    await h.db.query(
      "UPDATE research_requests SET created_at = now() - interval '31 days' WHERE id = $1",
      [request.id],
    );
    await h.db.query(
      "UPDATE research_projects SET confirmed_at = now() - interval '366 days' WHERE id = $1",
      [made.id],
    );
    const mine = await h.http().get('/api/v1/research/requests').set(as(asker)).expect(200);
    expect(mine.body.items.find((r: { id: string }) => r.id === request.id).state).toBe('EXPIRED');
    expect(await notices(asker.id, 'researchExpired')).toBe(1);
    const seen = await h.http().get(`/api/v1/research/projects/${made.id}`).set(as(asker));
    expect(seen.body.stale).toBe(true);
    // Saving it says it is still current.
    const saved = await h
      .http()
      .put(`/api/v1/research/projects/${made.id}`)
      .set(as(lead))
      .send(project({ title: made.title }))
      .expect(200);
    expect(saved.body.stale).toBe(false);
  });

  it('keeps publications, fills one from PubMed, and shows them as research interests are shown', async () => {
    const author = await person();
    const reader = await person('RESIDENT');
    const typed = await h
      .http()
      .post('/api/v1/me/publications')
      .set(as(author))
      .send({ title: 'A made-up paper', authors: 'Fictional A', year: 2025 })
      .expect(201);
    expect(typed.body).toMatchObject({ source: 'MANUAL', hidden: false });

    // PubMed, as a recorded answer: only the identifier is sent.
    const calls: string[] = [];
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(
        JSON.stringify({
          result: {
            '99000002': {
              title: 'Another made-up paper.',
              authors: [{ name: 'Fictional A' }],
              fulljournalname: 'Journal of Examples',
              pubdate: '2023',
              articleids: [],
            },
          },
        }),
        { status: 200 },
      );
    });
    const filled = await h
      .http()
      .post('/api/v1/me/publications/lookup')
      .set(as(author))
      .send({ pmid: '99000002' })
      .expect(200);
    expect(filled.body.items[0]).toMatchObject({
      title: 'Another made-up paper',
      year: 2023,
      pmid: '99000002',
      saved: false,
    });
    expect(calls[0]).toContain('id=99000002');
    spy.mockImplementation(async () => {
      throw new Error('down');
    });
    const down = await h
      .http()
      .post('/api/v1/me/publications/lookup')
      .set(as(author))
      .send({ pmid: '99000003' })
      .expect(503);
    expect(down.body.error.details[0].code).toBe('publicationSourceDown');
    spy.mockRestore();
    // Nothing was saved by the lookups.
    expect((await h.http().get('/api/v1/me/publications').set(as(author))).body.items).toHaveLength(
      1,
    );
    await h
      .http()
      .post('/api/v1/me/publications/lookup')
      .set(as(author))
      .send({ doi: 'not a doi' })
      .expect(400);

    // Others see them only when the author is listed and shows research interests.
    await h.http().get(`/api/v1/members/${author.id}/publications`).set(as(reader)).expect(404);
    await h.db.query('UPDATE profiles SET directory_opt_in = true WHERE user_id = $1', [author.id]);
    await h.db.query(
      `INSERT INTO profile_field_visibility (user_id, field, visibility)
       VALUES ($1, 'RESEARCH_INTERESTS', 'MEMBERS')
       ON CONFLICT (user_id, field) DO UPDATE SET visibility = 'MEMBERS'`,
      [author.id],
    );
    const shown = await h
      .http()
      .get(`/api/v1/members/${author.id}/publications`)
      .set(as(reader))
      .expect(200);
    expect(shown.body.items.map((p: { title: string }) => p.title)).toEqual(['A made-up paper']);
  });
});
