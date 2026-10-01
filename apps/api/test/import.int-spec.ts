import { type PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { type ImportFixtures, SOURCE_SITE, removeImport, seedImport } from '../prisma/seed/import';
import { type Harness, bearer, signInAdmin, startHarness } from './auth-harness';

/**
 * M4: the import seed layer, with fixtures written for this test (fictional titles on made-up
 * page numbers). The real site is never contacted.
 */
describe('content import (integration)', () => {
  let h: Harness;
  let prisma: PrismaClient;
  const run = Date.now();
  const newsUrl = (n: number) => `${SOURCE_SITE}ViewArticle.aspx?aId=${run}${n}`;
  const listUrl = `${SOURCE_SITE}ViewContent.aspx?CategoryId=${run}`;
  const conferenceUrl = `${SOURCE_SITE}ViewContent.aspx?CategoryId=${run}9`;
  const fixtures: ImportFixtures = {
    news: [
      {
        sourceUrl: newsUrl(1),
        title: `ידיעה מיובאת לדוגמה ${run}`,
        date: '2025-12-16',
        excerpt: null,
      },
      {
        sourceUrl: newsUrl(2),
        title: `ידיעה מיובאת שנייה ${run}`,
        date: '2025-08-09',
        excerpt: null,
      },
    ],
    documents: [
      {
        sourceUrl: listUrl,
        kind: 'position-papers',
        title: `נייר עמדה לדוגמה ${run} - 2016`,
        year: 2016,
        documentUrl: `http://docs.example.test/${run}.pdf`,
      },
    ],
    conferences: [{ sourceUrl: conferenceUrl, title: `כנס מיובא לדוגמה ${run}`, excerpt: null }],
  };

  beforeAll(async () => {
    h = await startHarness();
    prisma = h.app.get(PrismaService);
    // Earlier runs of this file leave nothing behind, but start clean in case one was cut short.
    await removeImport(prisma);
  });

  afterAll(async () => {
    await removeImport(prisma);
    await h.close();
  });

  it('loads each item once, however often it runs', async () => {
    expect(await seedImport(prisma, fixtures)).toEqual({ news: 2, guidelines: 1, events: 1 });
    const before = await h.db.query(
      `SELECT id, updated_at FROM news WHERE source_url LIKE $1 ORDER BY id`,
      [`${SOURCE_SITE}%`],
    );
    expect(await seedImport(prisma, fixtures)).toEqual({ news: 0, guidelines: 0, events: 0 });
    const after = await h.db.query(
      `SELECT id, updated_at FROM news WHERE source_url LIKE $1 ORDER BY id`,
      [`${SOURCE_SITE}%`],
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rows).toHaveLength(2);
  });

  it('shows imported news to everyone, with its original date and source address', async () => {
    const list = await h.http().get('/api/v1/news?category=iua_website&locale=he').expect(200);
    const item = (list.body.items as { title: string; slug: string }[]).find(
      (i) => i.title === fixtures.news[0]!.title,
    );
    expect(item).toMatchObject({
      sourceUrl: newsUrl(1),
      date: '2025-12-16T12:00:00.000Z',
      accessTier: 'PUBLIC',
      summary: null,
    });
    const article = await h
      .http()
      .get(`/api/v1/news/${encodeURIComponent(item!.slug)}?locale=en`)
      .expect(200);
    // Hebrew only: English readers get the Hebrew text with the fallback notice.
    expect(article.body).toMatchObject({ sourceUrl: newsUrl(1), body: '', fallback: true });
  });

  it('lists imported documents as guideline entries: a link and a year, no file', async () => {
    const row = await h.db.query(`SELECT g.id FROM guidelines g WHERE g.source_url = $1`, [
      listUrl,
    ]);
    const id = row.rows[0].id as string;
    const res = await h.http().get(`/api/v1/guidelines/${id}?locale=he`).expect(200);
    expect(res.body).toMatchObject({
      title: fixtures.documents[0]!.title,
      officialUrl: fixtures.documents[0]!.documentUrl,
      status: 'CURRENT',
      version: '2016',
      publishedOn: '2016-01-01',
      yearOnly: true,
    });
    expect(res.body.versions).toEqual([
      expect.objectContaining({ version: '2016', yearOnly: true, url: null }),
    ]);
    const files = await h.db.query(
      `SELECT count(*)::int AS n FROM files WHERE original_name LIKE $1`,
      [`%${run}%`],
    );
    expect(files.rows[0].n).toBe(0);
  });

  it('loads a conference page as a draft event without dates, hidden until an admin publishes it', async () => {
    const row = await h.db.query(
      'SELECT slug, status, start_at, end_at FROM events WHERE source_url = $1',
      [conferenceUrl],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({ status: 'DRAFT', start_at: null, end_at: null });
    await h
      .http()
      .get(`/api/v1/events/${encodeURIComponent(row.rows[0].slug as string)}`)
      .expect(404);
  });

  it('refuses fixtures from another site, and documents without a year', async () => {
    await expect(
      seedImport(prisma, {
        news: [
          { sourceUrl: 'https://example.test/a', title: 'x', date: '2025-01-01', excerpt: null },
        ],
        documents: [],
        conferences: [],
      }),
    ).rejects.toThrow('another site');
    await expect(
      seedImport(prisma, {
        news: [],
        documents: [
          {
            ...fixtures.documents[0]!,
            documentUrl: 'https://docs.example.test/none.pdf',
            year: null,
          },
        ],
        conferences: [],
      }),
    ).rejects.toThrow('without a year');
  });

  it('lets a revision of an imported item be drafted (the source stays on the live item)', async () => {
    const admin = await signInAdmin(h, 'import-admin');
    const live = await h.db.query(`SELECT id FROM news WHERE source_url = $1`, [newsUrl(2)]);
    const revision = await h
      .http()
      .post(`/api/v1/admin/news/${live.rows[0].id}/revision`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(revision.body).toMatchObject({ revisionOfId: live.rows[0].id, sourceUrl: null });
  });

  it('removes exactly the imported items', async () => {
    const admin = await signInAdmin(h, 'import-admin');
    const own = await h
      .http()
      .post('/api/v1/admin/news')
      .set(bearer(admin.accessToken))
      .send({ translations: { he: { title: `ידיעה רגילה ${run}`, body: 'x' } } })
      .expect(201);

    const removed = await removeImport(prisma);
    expect(removed).toEqual({ news: 2, guidelines: 1, events: 1 });
    const left = await h.db.query(
      `SELECT (SELECT count(*)::int FROM news WHERE source_url LIKE $1) AS news,
              (SELECT count(*)::int FROM guidelines WHERE source_url LIKE $1) AS guidelines,
              (SELECT count(*)::int FROM news WHERE id = $2) AS own`,
      [`${SOURCE_SITE}%`, own.body.id],
    );
    expect(left.rows[0]).toEqual({ news: 0, guidelines: 0, own: 1 });
    expect(await removeImport(prisma)).toEqual({ news: 0, guidelines: 0, events: 0 });
  });
});
