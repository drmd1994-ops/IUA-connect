import { uuidv7 } from '@medconnect/shared';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInWithMfa,
  startHarness,
  verifyPhysician,
} from './auth-harness';

/** M31: the journal club. Everyone and every article here is made up. */
describe('journal club (integration)', () => {
  let h: Harness;
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  let subspecialtyId: string;
  let otherSubspecialtyId: string;
  let communitySlug: string;

  beforeAll(async () => {
    h = await startHarness();
    // A subspecialty with an open community, for the discussion, and another one.
    const { rows } = await h.db.query<{ id: string; slug: string | null }>(
      `SELECT s.id, c.slug FROM subspecialties s
       LEFT JOIN communities c ON c.subspecialty_id = s.id AND c.archived_at IS NULL
       ORDER BY s.sort_order, s.key`,
    );
    const withCommunity = rows.find((row) => row.slug);
    if (withCommunity) {
      subspecialtyId = withCommunity.id;
      communitySlug = withCommunity.slug!;
    } else {
      subspecialtyId = rows[0]!.id;
      communitySlug = `jc-${run}`;
      await h.db.query(
        `INSERT INTO communities (id, slug, name_he, name_en, subspecialty_id, updated_at)
         VALUES ($1, $2, 'קהילה', 'A community', $3, now())`,
        [uuidv7(), communitySlug, subspecialtyId],
      );
    }
    otherSubspecialtyId = rows.find((row) => row.id !== subspecialtyId)!.id;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.close();
  });

  async function member(verified = true) {
    const email = await createVerifiedUser(h, 'journal');
    if (verified) await verifyPhysician(h, email);
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: `Name${run}${++n}`, lastName: 'Fictional' })
      .expect(200);
    return { email, accessToken };
  }

  const editor = (label: string) =>
    signInWithMfa(h, label, async (email) => {
      await verifyPhysician(h, email);
      await h.db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type)
         SELECT $1, u.id, r.id, 'NONE' FROM users u, roles r
         WHERE u.email = $2 AND r.key = 'CONTENT_EDITOR'`,
        [uuidv7(), email],
      );
    });

  const subspecialtyAdmin = (label: string, scopeId: string) =>
    signInWithMfa(h, label, async (email) => {
      await h.db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id)
         SELECT $1, u.id, r.id, 'SUBSPECIALTY', $3 FROM users u, roles r
         WHERE u.email = $2 AND r.key = 'SUBSPECIALTY_ADMIN'`,
        [uuidv7(), email, scopeId],
      );
    });

  const entry = (summaryAuthorEmail: string, extra: Record<string, unknown> = {}) => ({
    subspecialtyId,
    month: '2026-10',
    locale: 'en',
    articleTitle: `A made-up trial of training methods ${run}-${++n}`,
    articleAuthors: 'Fictional A, Sample B',
    journal: 'Sample Journal (fictional)',
    year: 2026,
    summary: 'A short summary in the writer’s own words.',
    summaryAuthorEmail,
    commentary: 'An expert’s view of what it means for training.',
    commentaryAuthorEmail: summaryAuthorEmail,
    keyPoints: ['A first point', 'A second point'],
    ...extra,
  });

  const step = (who: { accessToken: string }, id: string, action: string, comment?: string) =>
    h
      .http()
      .post(`/api/v1/admin/journal-club/${id}/transition`)
      .set(as(who))
      .send({ action, ...(comment ? { comment } : {}) });

  it('is written by one editor and published by another; publishing opens the discussion', async () => {
    const writer = await editor('jc-writer');
    const publisher = await editor('jc-publisher');
    const author = await member();

    const created = await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(writer))
      .send(entry(author.email))
      .expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', month: '2026-10', postId: null });
    const id = created.body.id as string;

    // Members see nothing of a draft.
    await h.http().get(`/api/v1/journal-club/${id}`).set(as(author)).expect(404);

    await step(writer, id, 'SUBMIT').expect(200);
    const own = await step(writer, id, 'PUBLISH').expect(403);
    expect(own.body.error.details[0].code).toBe('ownSubmission');
    await step(publisher, id, 'SEND_BACK').expect(400);
    await step(publisher, id, 'SEND_BACK', 'Please shorten the summary.').expect(200);
    await step(writer, id, 'SUBMIT').expect(200);
    const published = await step(publisher, id, 'PUBLISH').expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.postId).toEqual(expect.any(String));

    const read = await h.http().get(`/api/v1/journal-club/${id}`).set(as(author)).expect(200);
    expect(read.body).toMatchObject({
      summary: 'A short summary in the writer’s own words.',
      keyPoints: ['A first point', 'A second point'],
      discussion: { communitySlug, postId: published.body.postId },
      poll: { open: true, mine: null, totals: null },
    });
    expect(read.body.summaryAuthor.firstName).toMatch(/^Name/);

    // The discussion post is under the summary's author, in the subspecialty's community.
    const { rows } = await h.db.query<{ title: string; author: string }>(
      `SELECT p.title, u.email AS author FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = $1`,
      [published.body.postId],
    );
    expect(rows[0]).toMatchObject({ author: author.email });
    expect(rows[0]!.title).toContain('Journal club:');

    // The writer is told; it is announced once; the history has every step.
    const told = await h.db.query(
      "SELECT 1 FROM notifications WHERE type = 'journalClubPublished' AND user_id = $1",
      [writer.userId],
    );
    expect(told.rowCount).toBe(1);
    const announced = await h.db.query(
      "SELECT kind, access_tier FROM content_announcements WHERE entity_type = 'journal_club' AND entity_id = $1",
      [id],
    );
    expect(announced.rows).toEqual([{ kind: 'JOURNAL_CLUB', access_tier: 'VERIFIED' }]);
    const history = await h
      .http()
      .get(`/api/v1/admin/journal-club/${id}/history`)
      .set(as(publisher))
      .expect(200);
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'submit',
      'send_back',
      'submit',
      'publish',
    ]);

    // Taken back and published again: the same discussion, no second announcement.
    await step(writer, id, 'TAKE_BACK').expect(200);
    await step(writer, id, 'SUBMIT').expect(200);
    const again = await step(publisher, id, 'PUBLISH').expect(200);
    expect(again.body.postId).toBe(published.body.postId);
    const once = await h.db.query(
      "SELECT 1 FROM content_announcements WHERE entity_type = 'journal_club' AND entity_id = $1",
      [id],
    );
    expect(once.rowCount).toBe(1);
  });

  it('keeps the poll anonymous: one answer each, changeable, totals only after answering', async () => {
    const writer = await editor('jc-poll-writer');
    const publisher = await editor('jc-poll-publisher');
    const a = await member();
    const b = await member();
    const { body } = await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(writer))
      .send(entry(a.email))
      .expect(201);
    await step(writer, body.id, 'SUBMIT').expect(200);
    await step(publisher, body.id, 'PUBLISH').expect(200);
    const vote = (who: { accessToken: string }, answer: string) =>
      h.http().put(`/api/v1/journal-club/${body.id}/vote`).set(as(who)).send({ answer });

    const first = await vote(a, 'YES').expect(200);
    expect(first.body).toEqual({
      open: true,
      mine: 'YES',
      totals: { YES: 1, PERHAPS: 0, NO: 0, total: 1 },
    });
    // Before answering, b sees no totals.
    const before = await h.http().get(`/api/v1/journal-club/${body.id}`).set(as(b)).expect(200);
    expect(before.body.poll).toEqual({ open: true, mine: null, totals: null });
    await vote(b, 'NO').expect(200);
    const changed = await vote(a, 'PERHAPS').expect(200);
    expect(changed.body.totals).toEqual({ YES: 0, PERHAPS: 1, NO: 1, total: 2 });
    await vote(a, 'MAYBE').expect(400);

    // Closed: totals for everyone, no more answers.
    await step(writer, body.id, 'ARCHIVE').expect(200);
    const late = await member();
    const closed = await h.http().get(`/api/v1/journal-club/${body.id}`).set(as(late)).expect(200);
    expect(closed.body.poll).toEqual({
      open: false,
      mine: null,
      totals: { YES: 0, PERHAPS: 1, NO: 1, total: 2 },
    });
    const refused = await vote(late, 'YES').expect(422);
    expect(refused.body.error.details[0].code).toBe('journalClubPollClosed');
  });

  it('shows entries to verified people only, and lists the archive', async () => {
    const unverified = await member(false);
    await h.http().get('/api/v1/journal-club').set(as(unverified)).expect(403);
    const reader = await member();
    const list = await h.http().get('/api/v1/journal-club').set(as(reader)).expect(200);
    expect(list.body.current).not.toBeNull();
    expect(list.body.items.length).toBeGreaterThan(0);
    const none = await h
      .http()
      .get('/api/v1/journal-club')
      .query({ year: 1950 })
      .set(as(reader))
      .expect(200);
    expect(none.body.total).toBe(0);
  });

  it('lets a subspecialty admin work on their own subspecialty only', async () => {
    const admin = await subspecialtyAdmin('jc-sub-admin', subspecialtyId);
    const author = await member();
    const scope = await h.http().get('/api/v1/admin/journal-club/scope').set(as(admin)).expect(200);
    expect(scope.body).toEqual({ all: false, subspecialtyIds: [subspecialtyId] });
    await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(admin))
      .send(entry(author.email))
      .expect(201);
    const elsewhere = await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(admin))
      .send(entry(author.email, { subspecialtyId: otherSubspecialtyId }))
      .expect(400);
    expect(elsewhere.body.error.details[0].code).toBe('journalClubSubspecialtyNotYours');
    // A member without the role reaches nothing of the editors' pages.
    await h.http().get('/api/v1/admin/journal-club').set(as(author)).expect(403);
  });

  it('refuses patient details and unknown authors', async () => {
    const writer = await editor('jc-check');
    const author = await member();
    const details = await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(writer))
      .send(entry(author.email, { summary: 'The patient, ID 123456782, improved.' }))
      .expect(400);
    expect(details.body.error.details[0].field).toBe('summary');
    const unknown = await h
      .http()
      .post('/api/v1/admin/journal-club')
      .set(as(writer))
      .send(entry(`nobody-${run}@example.test`))
      .expect(400);
    expect(unknown.body.error.details[0].code).toBe('journalClubAuthorUnknown');
  });
});
