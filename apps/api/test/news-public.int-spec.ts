import sharp from 'sharp';
import { JobQueue } from '../src/infra/jobs/job-queue';
import { NEWS_PUBLISH_JOB } from '../src/modules/news/news-publish.job';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M3 checkpoint 5: public news under the access tiers, files, fallback, scheduling job. */
describe('public news and access tiers (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string };
  let reviewer: { accessToken: string };
  let types: Record<string, string>;
  const tag = `tier${Date.now()}`;
  const slugs: Record<'public' | 'members' | 'full', string> = {
    public: '',
    members: '',
    full: '',
  };
  let membersAttachment = '';
  let publicImage = '';
  /** Access tokens per kind of reader. */
  const readers: Record<string, string | null> = {};

  beforeAll(async () => {
    h = await startHarness();
    editor = await signInWithMfa(h, 'editor', (email) => grantRole(h, email, 'CONTENT_EDITOR'));
    reviewer = await signInAdmin(h, 'reviewer');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );

    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    publicImage = (
      await h
        .http()
        .post('/api/v1/files')
        .set(bearer(editor.accessToken))
        .attach('file', png, 'a.png')
    ).body.id;
    membersAttachment = (
      await h
        .http()
        .post('/api/v1/files')
        .set(bearer(editor.accessToken))
        .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'members.pdf')
    ).body.id;

    slugs.public = await publish({ featuredImageFileId: publicImage });
    slugs.members = await publish({
      accessTier: 'MEMBERS',
      attachmentFileIds: [membersAttachment],
    });
    slugs.full = await publish({ accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] });

    readers.anonymous = null;
    readers.noMembership = (await signIn(h, await createVerifiedUser(h, 'reader'))).accessToken;
    readers.full = await member('FULL_MEMBER');
    readers.student = await member('STUDENT');
    readers.suspended = await member('FULL_MEMBER', 'suspend');
    readers.expired = await member('FULL_MEMBER', 'expire');
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  async function publish(extra: object): Promise<string> {
    const created = await h
      .http()
      .post('/api/v1/admin/news')
      .set(bearer(editor.accessToken))
      .send({
        translations: { he: { title: `פריט ${tag} ${++n}`, body: 'גוף', summary: 'תקציר' } },
        tags: [tag],
        ...extra,
      })
      .expect(201);
    await h
      .http()
      .post(`/api/v1/admin/news/${created.body.id}/transitions`)
      .set(bearer(editor.accessToken))
      .send({ action: 'SUBMIT' })
      .expect(200);
    await h
      .http()
      .post(`/api/v1/admin/news/${created.body.id}/transitions`)
      .set(bearer(reviewer.accessToken))
      .send({ action: 'PUBLISH' })
      .expect(200);
    return created.body.slug;
  }

  /** A signed-in member whose membership is then suspended or ended, if asked. */
  async function member(typeKey: string, then?: 'suspend' | 'expire'): Promise<string> {
    const email = await createVerifiedUser(h, 'reader');
    const created = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(reviewer.accessToken))
      .send({
        email,
        typeId: types[typeKey],
        // Full members need a certificate number; a fresh one per test member.
        ...(typeKey === 'FULL_MEMBER'
          ? { identifier: String(300_000_000 + Math.floor(Math.random() * 600_000_000)) }
          : {}),
      })
      .expect(201);
    if (then) {
      await h
        .http()
        .post(`/api/v1/admin/memberships/${created.body.membership.id}/${then}`)
        .set(bearer(reviewer.accessToken))
        .send(then === 'suspend' ? { reason: 'Test' } : {})
        .expect(200);
    }
    return (await signIn(h, email)).accessToken;
  }

  const read = (token: string | null, path: string) => {
    const req = h.http().get(path);
    return token ? req.set(bearer(token)) : req;
  };

  const expected: Record<string, ('public' | 'members' | 'full')[]> = {
    anonymous: ['public'],
    noMembership: ['public'],
    full: ['public', 'members', 'full'],
    student: ['public', 'members'],
    suspended: ['public'],
    expired: ['public'],
  };

  for (const [who, visible] of Object.entries(expected)) {
    it(`${who}: sees ${visible.join(', ')} in lists and by link, and nothing else`, async () => {
      const list = await read(readers[who]!, `/api/v1/news?tag=${tag}&locale=he`).expect(200);
      expect((list.body.items as { slug: string }[]).map((i) => i.slug).sort()).toEqual(
        visible.map((key) => slugs[key]).sort(),
      );
      for (const key of ['public', 'members', 'full'] as const) {
        const res = await read(readers[who]!, `/api/v1/news/${encodeURIComponent(slugs[key])}`);
        expect(res.status).toBe(visible.includes(key) ? 200 : 404);
      }
    });
  }

  it('lets files follow their article: public image for all, members attachment for members', async () => {
    await read(null, `/api/v1/files/${publicImage}/url`).expect(200);
    await read(null, `/api/v1/files/${membersAttachment}/url`).expect(404);
    await read(readers.suspended!, `/api/v1/files/${membersAttachment}/url`).expect(404);
    await read(readers.student!, `/api/v1/files/${membersAttachment}/url`).expect(200);
  });

  it('shows the article with its attachments, and falls back to Hebrew', async () => {
    const res = await read(
      readers.full!,
      `/api/v1/news/${encodeURIComponent(slugs.members)}?locale=en`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: slugs.members,
      locale: 'he',
      fallback: true,
      body: 'גוף',
      archived: false,
      accessTier: 'MEMBERS',
      attachments: [{ id: membersAttachment, originalName: 'members.pdf' }],
    });
  });

  it('never shows drafts or items in review', async () => {
    const created = await h
      .http()
      .post('/api/v1/admin/news')
      .set(bearer(editor.accessToken))
      .send({ translations: { he: { title: `טיוטה ${tag}`, body: 'x' } }, tags: [tag] })
      .expect(201);
    await read(readers.full!, `/api/v1/news/${encodeURIComponent(created.body.slug)}`).expect(404);
  });

  it('hides archived items from lists but keeps their link', async () => {
    const slug = await publish({});
    const item = await h.db.query('SELECT id FROM news WHERE slug = $1', [slug]);
    await h
      .http()
      .post(`/api/v1/admin/news/${item.rows[0].id}/transitions`)
      .set(bearer(reviewer.accessToken))
      .send({ action: 'ARCHIVE' })
      .expect(200);
    const list = await read(null, `/api/v1/news?tag=${tag}`).expect(200);
    expect((list.body.items as { slug: string }[]).map((i) => i.slug)).not.toContain(slug);
    const res = await read(null, `/api/v1/news/${encodeURIComponent(slug)}`).expect(200);
    expect(res.body.archived).toBe(true);
  });

  it('publishes due items when the scheduled job runs', async () => {
    const created = await h
      .http()
      .post('/api/v1/admin/news')
      .set(bearer(editor.accessToken))
      .send({ translations: { he: { title: `מתוזמן ${tag}`, body: 'x' } }, tags: [tag] })
      .expect(201);
    const id = created.body.id as string;
    await h
      .http()
      .post(`/api/v1/admin/news/${id}/transitions`)
      .set(bearer(editor.accessToken))
      .send({ action: 'SUBMIT' })
      .expect(200);
    await h
      .http()
      .post(`/api/v1/admin/news/${id}/transitions`)
      .set(bearer(reviewer.accessToken))
      .send({ action: 'SCHEDULE', publishAt: new Date(Date.now() + 3_600_000).toISOString() })
      .expect(200);
    await read(null, `/api/v1/news/${encodeURIComponent(created.body.slug)}`).expect(404);

    // Time passes: move the schedule into the past, then let the job run.
    await h.db.query(`UPDATE news SET publish_at = now() - interval '1 minute' WHERE id = $1`, [
      id,
    ]);
    await h.app.get(JobQueue).runNow(NEWS_PUBLISH_JOB);
    await read(null, `/api/v1/news/${encodeURIComponent(created.body.slug)}`).expect(200);
  });

  it('lists active categories publicly', async () => {
    const res = await read(null, '/api/v1/news/categories').expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
