import {
  type Harness,
  bearer,
  expectAdminOnly,
  grantRole,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M23: the question bank. The questions here are made up for the test and say nothing medical.
 * Each test narrows practice to a subspecialty of its own where it counts questions.
 */
describe('question bank (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string };
  let reviewer: { accessToken: string };
  let subspecialties: { id: string; key: string }[];
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    editor = await signInWithMfa(h, 'bank-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );
    reviewer = await signInAdmin(h, 'bank-reviewer');
    subspecialties = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items;
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  /** Three options; the first is the right one. */
  const question = (extra: Record<string, unknown> = {}) => {
    const tag = `${run}-${++n}`;
    return {
      level: 'RESIDENT',
      subspecialtyId: subspecialties[0]!.id,
      translations: {
        he: { stem: `שאלת בנק ${tag}`, summary: `סיכום ${tag}` },
        en: { stem: `Bank question ${tag}`, summary: `Summary ${tag}` },
      },
      options: [0, 1, 2].map((index) => ({
        correct: index === 0,
        translations: {
          he: { text: `אפשרות ${index + 1} ${tag}`, explanation: `הסבר ${index + 1}` },
          en: { text: `Option ${index + 1} ${tag}`, explanation: `Why ${index + 1}` },
        },
      })),
      ...extra,
    };
  };
  const create = async (body: Record<string, unknown> = question()) =>
    (await h.http().post('/api/v1/admin/exam-questions').set(as(editor)).send(body).expect(201))
      .body as { id: string };
  const step = (who: { accessToken: string }, id: string, body: object) =>
    h.http().post(`/api/v1/admin/exam-questions/${id}/transitions`).set(as(who)).send(body);
  async function published(body?: Record<string, unknown>) {
    const item = await create(body);
    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    return item;
  }

  it('keeps difficulty, references and the source, and names the reviewer once published', async () => {
    const references = [
      { title: 'A made-up guideline, 2025', url: 'https://guidelines.example.test/1' },
      { title: 'A made-up textbook, chapter 3' },
    ];
    const item = await create(
      question({ difficulty: 'HARD', references, source: 'Written new for the test' }),
    );
    const draft = await h
      .http()
      .get(`/api/v1/admin/exam-questions/${item.id}`)
      .set(as(editor))
      .expect(200);
    expect(draft.body).toMatchObject({
      difficulty: 'HARD',
      references,
      source: 'Written new for the test',
      reviewer: null,
    });

    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    const before = Date.now();
    const done = await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    expect(Date.parse(done.body.reviewer.at)).toBeGreaterThanOrEqual(before - 1000);

    // The reader sees the difficulty with the question, and never where it comes from.
    const asked = await h
      .http()
      .get('/api/v1/exam-questions/next')
      .query({ subspecialty: subspecialties[0]!.key, exclude: '' })
      .expect(200);
    const all = [asked.body.question];
    expect(JSON.stringify(asked.body)).not.toContain('Written new');
    expect(all[0]).toHaveProperty('difficulty');

    const answered = await h
      .http()
      .post(`/api/v1/exam-questions/${item.id}/answer`)
      .send({ position: 1, locale: 'en' })
      .expect(200);
    expect(answered.body.references).toEqual(references);
    expect(answered.body.reviewer).toEqual(done.body.reviewer);
    expect(JSON.stringify(answered.body)).not.toContain('Written new');
  });

  it('imports a spreadsheet as drafts, or refuses it whole with the rows and reasons', async () => {
    await expectAdminOnly(h, 'get', '/api/v1/admin/exam-questions/import-template');
    await expectAdminOnly(h, 'post', '/api/v1/admin/exam-questions/import', { csv: 'x' });

    const template = await h
      .http()
      .get('/api/v1/admin/exam-questions/import-template')
      .set(as(editor))
      .expect(200);
    expect(template.headers['content-type']).toContain('text/csv');
    const header = template.text.replace(/^\uFEFF/, '').trim();
    const columns = header.split(',');
    const row = (values: Record<string, string>) =>
      columns.map((column) => values[column] ?? '').join(',');
    const tag = `import-${run}`;
    const good = {
      topic: subspecialties[1]!.key,
      level: 'SPECIALIST',
      difficulty: 'EASY',
      stem_he: `שאלה מיובאת ${tag}`,
      option_1_he: 'כן',
      explanation_1_he: 'הסבר',
      option_2_he: 'לא',
      explanation_2_he: 'הסבר',
      correct: '2',
      reference_1_title: 'A made-up paper',
      source: 'Written new for the test',
    };

    const refused = await h
      .http()
      .post('/api/v1/admin/exam-questions/import')
      .set(as(editor))
      .send({ csv: [header, row(good), row({ ...good, correct: '5' })].join('\r\n') })
      .expect(200);
    expect(refused.body).toEqual({
      imported: 0,
      problems: [{ row: 3, column: 'correct', code: 'importCorrectUnknown' }],
    });
    const none = await h
      .http()
      .get('/api/v1/admin/exam-questions')
      .query({ q: tag })
      .set(as(editor))
      .expect(200);
    expect(none.body.total).toBe(0);

    const imported = await h
      .http()
      .post('/api/v1/admin/exam-questions/import')
      .set(as(editor))
      .send({ csv: [header, row(good), row({ ...good, stem_he: `${good.stem_he} ב` })].join('\n') })
      .expect(200);
    expect(imported.body).toEqual({ imported: 2, problems: [] });
    const list = await h
      .http()
      .get('/api/v1/admin/exam-questions')
      .query({ q: tag })
      .set(as(editor))
      .expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items.every((item: { status: string }) => item.status === 'DRAFT')).toBe(true);
    const first = await h
      .http()
      .get(`/api/v1/admin/exam-questions/${list.body.items[0].id}`)
      .set(as(editor))
      .expect(200);
    expect(first.body).toMatchObject({
      level: 'SPECIALIST',
      difficulty: 'EASY',
      subspecialtyId: subspecialties[1]!.id,
      accessTier: 'PUBLIC',
      references: [{ title: 'A made-up paper' }],
      source: 'Written new for the test',
    });
    expect(first.body.options.map((o: { correct: boolean }) => o.correct)).toEqual([false, true]);
    const history = await h
      .http()
      .get(`/api/v1/admin/exam-questions/${first.body.id}/history`)
      .set(as(editor))
      .expect(200);
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual(['import']);
  });

  // Silences "declared but never read" until later steps use it.
  void published;
});
