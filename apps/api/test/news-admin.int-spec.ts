import { errorEnvelopeSchema } from '@medconnect/shared';
import sharp from 'sharp';
import { NewsAdminService } from '../src/modules/news';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  expectAdminOnly,
  grantRole,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M3 checkpoint 4: news editing, the review workflow, revisions and scheduling. */
describe('news administration (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string; email: string; userId: string };
  let reviewer: { accessToken: string; userId: string };
  let types: Record<string, string>;

  beforeAll(async () => {
    h = await startHarness();
    editor = await signInWithMfa(h, 'editor', (email) => grantRole(h, email, 'CONTENT_EDITOR'));
    reviewer = await signInAdmin(h, 'reviewer');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  const error = (body: unknown) => errorEnvelopeSchema.parse(body).error;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  let counter = 0;
  const draft = (overrides: object = {}) => ({
    organisationId: DEFAULT_ORGANISATION,
    translations: {
      he: { title: `ידיעה לבדיקה ${++counter}`, body: 'גוף **הידיעה**.', summary: 'תקציר' },
      en: { title: `Test item ${counter}`, body: 'The **body**.' },
    },
    tags: ['Conference', 'conference', 'Eilat'],
    references: [{ title: 'Source', url: 'https://example.test/source' }],
    ...overrides,
  });

  async function create(body: object = draft(), who: { accessToken: string } = editor) {
    const res = await h.http().post('/api/v1/admin/news').set(as(who)).send(body).expect(201);
    return res.body as { id: string; version: number; slug: string };
  }
  const transition = (who: { accessToken: string }, id: string, body: object) =>
    h.http().post(`/api/v1/admin/news/${id}/transitions`).set(as(who)).send(body);

  it('is staff-only', async () => {
    await expectAdminOnly(h, 'get', '/api/v1/admin/news');
    await expectAdminOnly(h, 'post', '/api/v1/admin/news', draft());
  });

  it('creates a draft with a Hebrew slug, cleaned text and tags', async () => {
    // Unique per run: the test database keeps earlier runs' items.
    const title = `הכנס השנתי ${Date.now()}`;
    const slug = title.replace(/ /g, '-');
    const res = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send(
        draft({
          translations: {
            he: {
              title,
              body: 'שלום <script>alert(1)</script> [x](javascript:alert(1))',
            },
          },
        }),
      )
      .expect(201);
    expect(res.headers.etag).toBe('"1"');
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      slug,
      accessTier: 'PUBLIC',
      tags: expect.arrayContaining(['conference', 'eilat']),
      authorUserId: editor.userId,
      version: 1,
    });
    expect(res.body.tags).toHaveLength(2);
    expect(res.body.translations.he.body).toBe('שלום  x');
    // The same title again gets a numbered slug.
    const again = await create(draft({ translations: { he: { title, body: 'x' } } }));
    expect(again.slug).toBe(`${slug}-2`);
  });

  it('saves only with the current version (If-Match)', async () => {
    const item = await create();
    const put = (ifMatch?: string) => {
      const req = h.http().put(`/api/v1/admin/news/${item.id}`).set(as(editor));
      return (ifMatch ? req.set('If-Match', ifMatch) : req).send(draft());
    };
    expect(error((await put().expect(412)).body).details).toEqual([{ code: 'newsChanged' }]);
    await put('"99"').expect(412);
    const ok = await put('"1"').expect(200);
    expect(ok.body.version).toBe(2);
    expect(ok.headers.etag).toBe('"2"');
    await put('"1"').expect(412); // stale now
  });

  it('runs draft → review → back → review → published, with four eyes and emails', async () => {
    const item = await create();
    // The editor can't publish.
    await transition(editor, item.id, { action: 'PUBLISH' }).expect(403);
    await transition(editor, item.id, { action: 'SUBMIT' }).expect(200);
    // Nothing can be edited while in review.
    const locked = await h
      .http()
      .put(`/api/v1/admin/news/${item.id}`)
      .set(as(editor))
      .set('If-Match', '"2"')
      .send(draft())
      .expect(422);
    expect(error(locked.body).details).toEqual([{ code: 'newsNotEditable' }]);

    const noComment = await transition(reviewer, item.id, { action: 'SEND_BACK' }).expect(400);
    expect(error(noComment.body).details).toEqual([{ code: 'commentRequired' }]);
    await transition(reviewer, item.id, { action: 'SEND_BACK', comment: 'Shorter title' }).expect(
      200,
    );
    expect(h.mailer.last(editor.email, 'newsSentBack')?.params).toMatchObject({
      reason: 'Shorter title',
    });

    await transition(editor, item.id, { action: 'SUBMIT' }).expect(200);
    const published = await transition(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', publishedAt: expect.any(String) });
    expect(h.mailer.last(editor.email, 'newsPublished')).toBeDefined();

    const history = await h.http().get(`/api/v1/admin/news/${item.id}/history`).set(as(reviewer));
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'submit',
      'send_back',
      'submit',
      'publish',
    ]);
    expect(history.body.items[2]).toMatchObject({ comment: 'Shorter title', toStatus: 'DRAFT' });
  });

  it('never lets the submitter approve their own item', async () => {
    const item = await create(draft(), reviewer);
    await transition(reviewer, item.id, { action: 'SUBMIT' }).expect(200);
    const own = await transition(reviewer, item.id, { action: 'PUBLISH' }).expect(403);
    expect(error(own.body).details).toEqual([{ code: 'ownSubmission' }]);
    const second = await signInAdmin(h, 'second-reviewer');
    await transition(second, item.id, { action: 'PUBLISH' }).expect(200);
  });

  it('needs Hebrew text before submitting', async () => {
    const item = await create({ translations: { en: { title: 'English only', body: 'Text' } } });
    const res = await transition(editor, item.id, { action: 'SUBMIT' }).expect(422);
    expect(error(res.body).details).toEqual([{ code: 'hebrewRequired' }]);
  });

  it('schedules into the future, and the job publishes it once', async () => {
    const item = await create();
    await transition(editor, item.id, { action: 'SUBMIT' }).expect(200);
    const past = await transition(reviewer, item.id, {
      action: 'SCHEDULE',
      publishAt: new Date(Date.now() - 60_000).toISOString(),
    }).expect(400);
    expect(error(past.body).details).toEqual([{ code: 'publishAtInPast' }]);
    const at = new Date(Date.now() + 3_600_000);
    const scheduled = await transition(reviewer, item.id, {
      action: 'SCHEDULE',
      publishAt: at.toISOString(),
    }).expect(200);
    expect(scheduled.body).toMatchObject({ status: 'SCHEDULED', publishAt: at.toISOString() });

    const service = h.app.get(NewsAdminService);
    expect(await service.publishDue(new Date())).toBe(0); // not yet
    expect(await service.publishDue(new Date(at.getTime() + 1000))).toBeGreaterThanOrEqual(1);
    const after = await h.http().get(`/api/v1/admin/news/${item.id}`).set(as(reviewer));
    expect(after.body).toMatchObject({ status: 'PUBLISHED', publishedAt: at.toISOString() });
    expect(await service.publishDue(new Date(at.getTime() + 2000))).toBe(0);
  });

  it('revises a published item without touching the live text until approved', async () => {
    const item = await create();
    await transition(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await transition(reviewer, item.id, { action: 'PUBLISH' }).expect(200);

    const rev = await h
      .http()
      .post(`/api/v1/admin/news/${item.id}/revision`)
      .set(as(editor))
      .expect(200);
    expect(rev.body).toMatchObject({ status: 'DRAFT', revisionOfId: item.id, slug: null });
    const same = await h.http().post(`/api/v1/admin/news/${item.id}/revision`).set(as(editor));
    expect(same.body.id).toBe(rev.body.id); // one revision at a time

    const changed = draft();
    changed.translations.he.title = 'כותרת מתוקנת';
    await h
      .http()
      .put(`/api/v1/admin/news/${rev.body.id}`)
      .set(as(editor))
      .set('If-Match', `"${rev.body.version}"`)
      .send(changed)
      .expect(200);
    let live = await h.http().get(`/api/v1/admin/news/${item.id}`).set(as(reviewer));
    expect(live.body.translations.he.title).not.toBe('כותרת מתוקנת');
    expect(live.body.revisionId).toBe(rev.body.id);

    await transition(editor, rev.body.id, { action: 'SUBMIT' }).expect(200);
    const done = await transition(reviewer, rev.body.id, { action: 'PUBLISH' }).expect(200);
    expect(done.body.id).toBe(item.id);
    live = await h.http().get(`/api/v1/admin/news/${item.id}`).set(as(reviewer));
    expect(live.body).toMatchObject({
      status: 'PUBLISHED',
      slug: item.slug,
      revisionId: null,
      translations: { he: { title: 'כותרת מתוקנת' } },
    });
    await h.http().get(`/api/v1/admin/news/${rev.body.id}`).set(as(reviewer)).expect(404);
    const history = await h.http().get(`/api/v1/admin/news/${item.id}/history`).set(as(reviewer));
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'submit',
      'publish',
      'revision.create',
      'revision.submit',
      'revision.publish',
    ]);
  });

  it('archives, deletes only unpublished drafts, and keeps history append-only', async () => {
    const item = await create();
    await transition(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await transition(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    await h.http().delete(`/api/v1/admin/news/${item.id}`).set(as(editor)).expect(422);
    await transition(reviewer, item.id, { action: 'ARCHIVE' }).expect(200);

    const scrap = await create();
    await h.http().delete(`/api/v1/admin/news/${scrap.id}`).set(as(editor)).expect(204);
    await expect(h.db.query(`UPDATE news_history SET comment = 'x'`)).rejects.toThrow(
      /append-only/,
    );
  });

  it('validates tiers, files and categories', async () => {
    const noTypes = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send(draft({ accessTier: 'TYPES' }))
      .expect(400);
    expect(error(noTypes.body).code).toBe('VALIDATION_FAILED');
    const typed = await create(draft({ accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] }));
    const got = await h.http().get(`/api/v1/admin/news/${typed.id}`).set(as(editor));
    expect(got.body).toMatchObject({ accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] });

    const pdf = await h
      .http()
      .post('/api/v1/files')
      .set(as(editor))
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'a.pdf')
      .expect(201);
    const asImage = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send(draft({ featuredImageFileId: pdf.body.id }))
      .expect(400);
    expect(error(asImage.body).details).toEqual([
      { field: 'featuredImageFileId', code: 'unknownImage' },
    ]);
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const image = await h
      .http()
      .post('/api/v1/files')
      .set(as(editor))
      .attach('file', png, 'a.png')
      .expect(201);
    const withFiles = await create(
      draft({ featuredImageFileId: image.body.id, attachmentFileIds: [pdf.body.id] }),
    );
    const files = await h.db.query(
      'SELECT attached_at IS NOT NULL AS attached FROM files WHERE id = ANY($1)',
      [[image.body.id, pdf.body.id]],
    );
    expect(files.rows).toEqual([{ attached: true }, { attached: true }]);
    expect(withFiles.id).toBeDefined();

    const badCategory = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send(draft({ categoryId: '0190a000-0000-7000-8000-000000000000' }))
      .expect(400);
    expect(error(badCategory.body).details).toEqual([
      { field: 'categoryId', code: 'unknownCategory' },
    ]);
  });

  it('manages categories (admins only)', async () => {
    await h
      .http()
      .post('/api/v1/admin/news/categories')
      .set(as(editor))
      .send({ key: 'ed_try', nameHe: 'א', nameEn: 'A' })
      .expect(403);
    const key = `cat_${Date.now()}`;
    const created = await h
      .http()
      .post('/api/v1/admin/news/categories')
      .set(as(reviewer))
      .send({ key, nameHe: 'כנסים', nameEn: 'Conferences' })
      .expect(201);
    await h
      .http()
      .post('/api/v1/admin/news/categories')
      .set(as(reviewer))
      .send({ key, nameHe: 'כנסים', nameEn: 'Conferences' })
      .expect(409);
    await h
      .http()
      .patch(`/api/v1/admin/news/categories/${created.body.id}`)
      .set(as(reviewer))
      .send({ active: false })
      .expect(200);
    const item = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send(draft({ categoryId: created.body.id }))
      .expect(400); // inactive
    expect(error(item.body).details).toEqual([{ field: 'categoryId', code: 'unknownCategory' }]);
  });
});
