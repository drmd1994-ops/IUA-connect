import sharp from 'sharp';
import { uuidv7 } from '@medconnect/shared';
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

/** M26: case discussions. Every case here is made up. */
describe('case discussions (integration)', () => {
  let h: Harness;
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  let subspecialtyId: string;
  let otherSubspecialtyId: string;
  let communityId: string;
  let communitySlug: string;

  beforeAll(async () => {
    h = await startHarness();
    const { rows } = await h.db.query<{
      id: string;
      community: string | null;
      slug: string | null;
    }>(
      `SELECT s.id, c.id AS community, c.slug FROM subspecialties s
       LEFT JOIN communities c ON c.subspecialty_id = s.id AND c.archived_at IS NULL
       ORDER BY s.sort_order, s.key`,
    );
    const withCommunity = rows.find((row) => row.community);
    if (withCommunity) {
      subspecialtyId = withCommunity.id;
      communityId = withCommunity.community!;
      communitySlug = withCommunity.slug!;
    } else {
      subspecialtyId = rows[0]!.id;
      communityId = uuidv7();
      communitySlug = `cases-${run}`;
      await h.db.query(
        `INSERT INTO communities (id, slug, name_he, name_en, subspecialty_id, updated_at)
         VALUES ($1, $2, 'קהילה', 'A community', $3, now())`,
        [communityId, communitySlug, subspecialtyId],
      );
    }
    otherSubspecialtyId = rows.find((row) => row.id !== subspecialtyId)!.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.close();
  });

  async function person(verified = true): Promise<Person> {
    const email = await createVerifiedUser(h, 'cases');
    if (verified) await verifyPhysician(h, email);
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

  /** A moderator of the test community, who reviews its subspecialty's cases. */
  async function moderator(): Promise<Person> {
    const who = await person();
    await h.db.query(
      'INSERT INTO community_moderators (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [communityId, who.id],
    );
    return who;
  }

  const input = (extra: Record<string, unknown> = {}) => ({
    subspecialtyId,
    title: `A made-up case of flank pain ${run}-${++n}`,
    ageRange: 'FROM_40_TO_64',
    sex: 'MALE',
    history: 'Two days of left flank pain, no fever. A made-up case.',
    imaging: 'A made-up finding on imaging.',
    question: 'Would you treat this conservatively first?',
    pollOptions: ['Watch and wait', 'Treat now'],
    ...extra,
  });

  const create = async (author: Person, extra: Record<string, unknown> = {}) =>
    (await h.http().post('/api/v1/cases').set(as(author)).send(input(extra)).expect(201)).body as {
      id: string;
      poll: { options: { id: string }[] };
    };
  const review = (who: Person, id: string, action: string, note?: string) =>
    h
      .http()
      .post(`/api/v1/cases/${id}/review`)
      .set(as(who))
      .send({ action, ...(note ? { note } : {}) });

  it('is seen by nobody but its author and reviewers until approved; approval opens the discussion', async () => {
    const author = await person();
    const reviewer = await moderator();
    const reader = await person();
    const draft = await create(author);
    await h.http().get(`/api/v1/cases/${draft.id}`).set(as(reader)).expect(404);
    await review(reviewer, draft.id, 'APPROVE').expect(422);

    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(author)).expect(200);
    await h.http().get(`/api/v1/cases/${draft.id}`).set(as(reader)).expect(404);
    const waiting = await h.db.query(
      "SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'caseWaiting'",
      [reviewer.id],
    );
    expect(waiting.rowCount).toBe(1);
    const queue = await h.http().get('/api/v1/cases/review').set(as(reviewer)).expect(200);
    expect(queue.body.items.map((i: { id: string }) => i.id)).toContain(draft.id);
    await h.http().get('/api/v1/cases/review').set(as(reader)).expect(403);

    // Returned with the reason; changed; sent again; approved.
    await review(reviewer, draft.id, 'RETURN').expect(400);
    await review(reviewer, draft.id, 'RETURN', 'Please remove the exact age.').expect(200);
    const mine = await h.http().get(`/api/v1/cases/${draft.id}`).set(as(author)).expect(200);
    expect(mine.body).toMatchObject({
      status: 'RETURNED',
      reviewNote: 'Please remove the exact age.',
      canEdit: true,
    });
    await h
      .http()
      .put(`/api/v1/cases/${draft.id}`)
      .set(as(author))
      .send(input({ title: 'A made-up case, changed' }))
      .expect(200);
    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(author)).expect(200);
    const approved = await review(reviewer, draft.id, 'APPROVE').expect(200);
    expect(approved.body.status).toBe('PUBLISHED');
    expect(approved.body.discussion).toEqual({ communitySlug, postId: expect.any(String) });

    const read = await h.http().get(`/api/v1/cases/${draft.id}`).set(as(reader)).expect(200);
    expect(read.body).toMatchObject({
      title: 'A made-up case, changed',
      mine: false,
      canEdit: false,
    });
    expect(read.body.author.firstName).toMatch(/^Name/);
    expect(read.body.author).not.toHaveProperty('hospital');
    const told = await h.db.query(
      "SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'caseApproved'",
      [author.id],
    );
    expect(told.rowCount).toBe(1);
    const history = await h
      .http()
      .get(`/api/v1/cases/${draft.id}/history`)
      .set(as(author))
      .expect(200);
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'submit',
      'return',
      'submit',
      'approve',
    ]);
  });

  it('never lets a moderator approve their own case, nor review another subspecialty', async () => {
    const own = await moderator();
    const draft = await create(own);
    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(own)).expect(200);
    const refused = await review(own, draft.id, 'APPROVE').expect(403);
    expect(refused.body.error.details[0].code).toBe('caseOwnReview');

    const author = await person();
    const elsewhere = await create(author, { subspecialtyId: otherSubspecialtyId });
    await h.http().post(`/api/v1/cases/${elsewhere.id}/submit`).set(as(author)).expect(200);
    await review(own, elsewhere.id, 'APPROVE').expect(404);
  });

  it('refuses patient details, names after a title included', async () => {
    const author = await person();
    const named = await h
      .http()
      .post('/api/v1/cases')
      .set(as(author))
      .send(input({ history: 'Mrs. Levi came with pain.' }))
      .expect(400);
    expect(named.body.error.details[0]).toMatchObject({
      field: 'history',
      code: expect.any(String),
    });
    const hebrew = await h
      .http()
      .post('/api/v1/cases')
      .set(as(author))
      .send(input({ question: 'מה הייתם עושים עם מר כהן?' }))
      .expect(400);
    expect(hebrew.body.error.details[0].field).toBe('question');
    await h
      .http()
      .post('/api/v1/cases')
      .set(as(author))
      .send(input({ history: 'כאב גב תחתון וטעם מר בפה. מקרה בדוי.' }))
      .expect(201);
  });

  it('keeps pictures to whoever reads the case, strips their data, and refuses other files', async () => {
    const author = await person();
    const reviewer = await moderator();
    const reader = await person();
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 100, b: 100 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: 'A patient name' } } })
      .toBuffer();
    await h
      .http()
      .post('/api/v1/cases/pictures')
      .set(as(author))
      .attach('file', jpeg, 'scan.jpg')
      .expect(400);
    const uploaded = await h
      .http()
      .post('/api/v1/cases/pictures')
      .query({ confirmed: 'true' })
      .set(as(author))
      .attach('file', jpeg, 'scan.jpg')
      .expect(201);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const refused = await h
      .http()
      .post('/api/v1/cases/pictures')
      .query({ confirmed: 'true' })
      .set(as(author))
      .attach('file', pdf, 'notes.pdf')
      .expect(400);
    expect(refused.body.error.details[0].code).toBe('casePictureType');

    // Without the confirmation in the case, the picture isn't added.
    await h
      .http()
      .post('/api/v1/cases')
      .set(as(author))
      .send(input({ fileIds: [uploaded.body.id] }))
      .expect(400);
    const draft = await create(author, { fileIds: [uploaded.body.id], picturesConfirmed: true });
    const url = (who: Person) => h.http().get(`/api/v1/files/${uploaded.body.id}/url`).set(as(who));
    await url(author).expect(200);
    await url(reader).expect(404);
    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(author)).expect(200);
    await url(reviewer).expect(200);
    await review(reviewer, draft.id, 'APPROVE').expect(200);
    const signed = await url(reader).expect(200);
    // The stored picture, as a reader gets it: its hidden data (here a name) is gone.
    const link = new URL(signed.body.url as string, 'http://localhost');
    const bytes = await h
      .http()
      .get(link.pathname + link.search)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const meta = await sharp(bytes.body as Buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
  });

  it('hides a reported case at once, until a reviewer restores or removes it', async () => {
    const author = await person();
    const reviewer = await moderator();
    const reader = await person();
    const draft = await create(author);
    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(author)).expect(200);
    await review(reviewer, draft.id, 'APPROVE').expect(200);

    await h
      .http()
      .post(`/api/v1/cases/${draft.id}/report`)
      .set(as(reader))
      .send({ reason: 'It mentions a rare finding that could identify someone.' })
      .expect(204);
    await h.http().get(`/api/v1/cases/${draft.id}`).set(as(reader)).expect(404);
    const queue = await h.http().get('/api/v1/cases/review').set(as(reviewer)).expect(200);
    expect(queue.body.items.find((i: { id: string }) => i.id === draft.id)).toMatchObject({
      status: 'HIDDEN',
      openReports: 1,
    });
    await review(reviewer, draft.id, 'RESTORE').expect(200);
    await h.http().get(`/api/v1/cases/${draft.id}`).set(as(reader)).expect(200);

    await h
      .http()
      .post(`/api/v1/cases/${draft.id}/report`)
      .set(as(reader))
      .send({ reason: 'Again.' })
      .expect(204);
    const removed = await review(reviewer, draft.id, 'REMOVE', 'Too identifying.').expect(200);
    expect(removed.body.status).toBe('REMOVED');
    const post = await h.db.query('SELECT removed_at FROM posts WHERE id = $1', [
      removed.body.discussion?.postId ??
        (await h.db.query('SELECT post_id FROM cases WHERE id = $1', [draft.id])).rows[0].post_id,
    ]);
    expect(post.rows[0].removed_at).not.toBeNull();
  });

  it('keeps the poll anonymous, and shows the case of the week', async () => {
    const author = await person();
    const reviewer = await moderator();
    const a = await person();
    const b = await person();
    const draft = await create(author);
    await h.http().post(`/api/v1/cases/${draft.id}/submit`).set(as(author)).expect(200);
    await review(reviewer, draft.id, 'APPROVE').expect(200);
    const [first, second] = draft.poll.options;

    const before = await h.http().get(`/api/v1/cases/${draft.id}`).set(as(b)).expect(200);
    expect(before.body.poll).toMatchObject({ mine: null, totals: null, total: 0 });
    const voted = await h
      .http()
      .put(`/api/v1/cases/${draft.id}/vote`)
      .set(as(a))
      .send({ optionId: first!.id })
      .expect(200);
    expect(voted.body).toMatchObject({ mine: first!.id, total: 1 });
    expect(voted.body.totals).toEqual({ [first!.id]: 1, [second!.id]: 0 });
    await h
      .http()
      .put(`/api/v1/cases/${draft.id}/vote`)
      .set(as(a))
      .send({ optionId: second!.id })
      .expect(200);
    await h
      .http()
      .put(`/api/v1/cases/${draft.id}/vote`)
      .set(as(b))
      .send({ optionId: uuidv7() })
      .expect(400);

    await review(reviewer, draft.id, 'WEEK').expect(200);
    const list = await h.http().get('/api/v1/cases').set(as(b)).expect(200);
    expect(list.body.week.id).toBe(draft.id);
    expect(list.body.reviewer).toBe(false);
  });

  it('is for verified people only', async () => {
    const unverified = await person(false);
    await h.http().get('/api/v1/cases').set(as(unverified)).expect(403);
    await h.http().post('/api/v1/cases').set(as(unverified)).send(input()).expect(403);
  });
});
