import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  grantRole,
  signIn,
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

  const person = async () => (await signIn(h, await createVerifiedUser(h, 'bank'))).accessToken;
  const next = (token: string | null, query: Record<string, string>) => {
    const req = h
      .http()
      .get('/api/v1/exam-questions/next')
      .query({ exclude: '', ...query });
    return token ? req.set(bearer(token)) : req;
  };
  const answer = (token: string, id: string, position: number) =>
    h
      .http()
      .post(`/api/v1/exam-questions/${id}/answer`)
      .set(bearer(token))
      .send({ position, locale: 'en' })
      .expect(200);

  it('leaves out what the person answered right in the last 30 days', async () => {
    const topic = subspecialties[3]!;
    const right = await published(question({ subspecialtyId: topic.id }));
    await published(question({ subspecialtyId: topic.id }));
    const me = await person();
    await answer(me, right.id, 1);

    // Every question of the topic, one by one: the one answered right never comes.
    const seen: string[] = [];
    for (;;) {
      const res = await next(me, { subspecialty: topic.key, exclude: seen.join(',') }).expect(200);
      expect(res.body.leftOutRecentlyRight).toBe(1);
      if (!res.body.question) break;
      seen.push(res.body.question.id);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(right.id);

    // A visitor, or someone else, still gets it.
    const other = await next(null, { subspecialty: topic.key }).expect(200);
    expect(other.body.leftOutRecentlyRight).toBe(0);
  });

  it('practises the ones the person got wrong, until they get them right', async () => {
    const item = await published();
    const me = await person();
    await next(null, { set: 'wrong' }).expect(401);
    expect((await next(me, { set: 'wrong' }).expect(200)).body.question).toBeNull();
    await answer(me, item.id, 2);
    const wrong = await next(me, { set: 'wrong' }).expect(200);
    expect(wrong.body).toMatchObject({ question: { id: item.id }, remaining: 0 });
    await answer(me, item.id, 1);
    expect((await next(me, { set: 'wrong' }).expect(200)).body.question).toBeNull();
  });

  it('keeps bookmarks for their person only, to read and to practise', async () => {
    const item = await published();
    const me = await person();
    const other = await person();
    await h.http().put(`/api/v1/me/exam-bookmarks/${item.id}`).expect(401);
    await h.http().get('/api/v1/me/exam-bookmarks').expect(401);
    await next(null, { set: 'bookmarks' }).expect(401);
    const draft = await create();
    await h.http().put(`/api/v1/me/exam-bookmarks/${draft.id}`).set(bearer(me)).expect(404);

    await h.http().put(`/api/v1/me/exam-bookmarks/${item.id}`).set(bearer(me)).expect(204);
    await h.http().put(`/api/v1/me/exam-bookmarks/${item.id}`).set(bearer(me)).expect(204);
    const list = await h.http().get('/api/v1/me/exam-bookmarks').set(bearer(me)).expect(200);
    expect(list.body.items.map((i: { questionId: string }) => i.questionId)).toEqual([item.id]);
    const theirs = await h.http().get('/api/v1/me/exam-bookmarks').set(bearer(other)).expect(200);
    expect(theirs.body.items).toEqual([]);

    const practice = await next(me, { set: 'bookmarks' }).expect(200);
    expect(practice.body).toMatchObject({
      question: { id: item.id, bookmarked: true },
      remaining: 0,
    });
    expect((await answer(me, item.id, 1)).body.bookmarked).toBe(true);
    expect((await next(other, { set: 'bookmarks' }).expect(200)).body.question).toBeNull();

    await h.http().delete(`/api/v1/me/exam-bookmarks/${item.id}`).set(bearer(me)).expect(204);
    expect((await next(me, { set: 'bookmarks' }).expect(200)).body.question).toBeNull();
  });
  it('shows progress by topic and by week from first answers, and the weak topics', async () => {
    await h.http().get('/api/v1/me/exam-progress').expect(401);
    const weakTopic = subspecialties[7]!;
    const goodTopic = subspecialties[8]!;
    const weakOnes = [];
    for (let i = 0; i < 5; i += 1)
      weakOnes.push(await published(question({ subspecialtyId: weakTopic.id })));
    const goodOnes = [];
    for (let i = 0; i < 5; i += 1)
      goodOnes.push(await published(question({ subspecialtyId: goodTopic.id })));
    const me = await person();
    // Weak: 2 of 5 right (40%). Good: 3 of 5 (60%, not below). Answering again changes nothing.
    for (const [i, item] of weakOnes.entries()) await answer(me, item.id, i < 2 ? 1 : 2);
    for (const [i, item] of goodOnes.entries()) await answer(me, item.id, i < 3 ? 1 : 2);
    await answer(me, weakOnes[4]!.id, 1);

    const res = await h.http().get('/api/v1/me/exam-progress').set(bearer(me)).expect(200);
    expect(res.body).toMatchObject({ answered: 10, correct: 5, percent: 50 });
    const line = (key: string) => res.body.topics.find((t: { key: string }) => t.key === key);
    expect(line(weakTopic.key)).toMatchObject({ answered: 5, correct: 2, percent: 40, weak: true });
    expect(line(goodTopic.key)).toMatchObject({
      answered: 5,
      correct: 3,
      percent: 60,
      weak: false,
    });
    expect(line(goodTopic.key).available).toBeGreaterThanOrEqual(5);
    expect(res.body.topics).toHaveLength(subspecialties.length);
    expect(res.body.weeks).toHaveLength(12);
    expect(res.body.weeks[11]).toMatchObject({ answered: 10, correct: 5 });

    // Someone else's progress is theirs alone.
    const other = await h
      .http()
      .get('/api/v1/me/exam-progress')
      .set(bearer(await person()))
      .expect(200);
    expect(other.body).toMatchObject({ answered: 0, percent: null });
  });

  it('takes a reader’s report to the reviewers, who never see who sent it, and tells the reader', async () => {
    const item = await published();
    const email = await createVerifiedUser(h, 'reporter');
    const me = (await signIn(h, email)).accessToken;
    const reportsOf = `/api/v1/exam-questions/${item.id}/reports`;
    await h.http().post(reportsOf).send({ reason: 'UNCLEAR' }).expect(401);
    await h.http().post(reportsOf).set(bearer(me)).send({ reason: 'OTHER' }).expect(400);
    const draft = await create();
    await h
      .http()
      .post(`/api/v1/exam-questions/${draft.id}/reports`)
      .set(bearer(me))
      .send({ reason: 'UNCLEAR' })
      .expect(404);

    const sent = await h
      .http()
      .post(reportsOf)
      .set(bearer(me))
      .send({ reason: 'WRONG_ANSWER', text: `Option 2 looks right to me ${run}` })
      .expect(201);
    // One open report per person and question.
    await h
      .http()
      .post(reportsOf)
      .set(bearer(me))
      .send({ reason: 'TYPO' })
      .expect(409)
      .expect((res) => expect(res.body.error.details[0].code).toBe('examReportOpen'));

    // The queue is for question reviewers; an editor who only writes can't open it.
    await h.http().get('/api/v1/admin/exam-reports').set(as(editor)).expect(403);
    await h.http().get('/api/v1/admin/exam-reports').set(bearer(me)).expect(403);
    const queue = await h
      .http()
      .get('/api/v1/admin/exam-reports')
      .query({ pageSize: 100 })
      .set(as(reviewer))
      .expect(200);
    const mine = queue.body.items.find((r: { id: string }) => r.id === sent.body.id);
    expect(mine).toMatchObject({
      questionId: item.id,
      questionStatus: 'PUBLISHED',
      reason: 'WRONG_ANSWER',
      status: 'OPEN',
    });
    expect(JSON.stringify(queue.body)).not.toContain(email);
    expect(Object.keys(mine)).not.toContain('userId');

    // The question stays published while the report waits.
    await answer(me, item.id, 1);

    const decision = `/api/v1/admin/exam-reports/${sent.body.id}/decision`;
    await h
      .http()
      .post(decision)
      .set(as(editor))
      .send({ outcome: 'DISMISSED', response: 'x' })
      .expect(403);
    await h
      .http()
      .post(decision)
      .set(as(reviewer))
      .send({ outcome: 'DISMISSED', response: 'Option 1 is right; see the reference.' })
      .expect(204);
    await h
      .http()
      .post(decision)
      .set(as(reviewer))
      .send({ outcome: 'RESOLVED', response: 'again' })
      .expect(409);
    const told = h.mailer.last(email, 'examReportHandled');
    expect(told?.params).toMatchObject({ reason: 'Option 1 is right; see the reference.' });
    const reports = await h
      .http()
      .get('/api/v1/me/exam-reports')
      .query({ locale: 'en' })
      .set(bearer(me))
      .expect(200);
    expect(reports.body.items).toEqual([
      expect.objectContaining({
        id: sent.body.id,
        status: 'DISMISSED',
        response: 'Option 1 is right; see the reference.',
      }),
    ]);
    const others = await h
      .http()
      .get('/api/v1/me/exam-reports')
      .set(bearer(await person()))
      .expect(200);
    expect(others.body.items).toEqual([]);

    // Dealt with: a new report may be sent.
    await h.http().post(reportsOf).set(bearer(me)).send({ reason: 'TYPO' }).expect(201);
  });

  it('gives staff each question’s statistics only from five people, and never who', async () => {
    const item = await published();
    const statistics = `/api/v1/admin/exam-questions/${item.id}/statistics`;
    await expectAdminOnly(h, 'get', statistics);
    const people = [];
    for (let i = 0; i < 5; i += 1) people.push(await person());
    // Four people: 1, 1, 2, 3. The first answer is the one that counts.
    for (const [i, me] of people.slice(0, 4).entries()) await answer(me, item.id, [1, 1, 2, 3][i]!);
    await answer(people[0]!, item.id, 3);
    const few = await h.http().get(statistics).set(as(editor)).expect(200);
    expect(few.body).toEqual({
      answered: null,
      percentCorrect: null,
      options: [1, 2, 3].map((position) => ({ position, chosen: null })),
      shownFrom: 5,
      openReports: 0,
    });
    await answer(people[4]!, item.id, 1);
    const enough = await h.http().get(statistics).set(as(editor)).expect(200);
    expect(enough.body).toEqual({
      answered: 5,
      percentCorrect: 60,
      options: [
        { position: 1, chosen: 3 },
        { position: 2, chosen: 1 },
        { position: 3, chosen: 1 },
      ],
      shownFrom: 5,
      openReports: 0,
    });
  });

  describe('the mock exam', () => {
    const exams = '/api/v1/me/mock-exams';
    const start = (token: string, body: object) =>
      h.http().post(exams).query({ locale: 'en' }).set(bearer(token)).send(body);
    const choose = (token: string, id: string, position: number, chosen: number | null) =>
      h
        .http()
        .put(`${exams}/${id}/answers/${position}`)
        .set(bearer(token))
        .send({ position: chosen });
    /** Moves the exam's clock as if it had started this many seconds earlier. */
    const age = (id: string, seconds: number) =>
      h.db.query(
        `UPDATE mock_exams SET started_at = started_at - make_interval(secs => $2),
           ends_at = ends_at - make_interval(secs => $2) WHERE id = $1`,
        [id, seconds],
      );

    it('is for signed-in people, and each exam is its own person’s', async () => {
      await h.http().get(exams).expect(401);
      await h.http().post(exams).send({ size: 10 }).expect(401);
      const me = await person();
      await start(me, { size: 12 }).expect(400);
      await start(me, { size: 10, subspecialties: ['no-such-topic'] })
        .expect(422)
        .expect((res) => expect(res.body.error.details[0].code).toBe('mockExamNoQuestions'));
      await published(question({ subspecialtyId: subspecialties[4]!.id }));
      const exam = (
        await start(me, { size: 10, subspecialties: [subspecialties[4]!.key] }).expect(201)
      ).body;
      const other = await person();
      await h.http().get(`${exams}/${exam.id}`).set(bearer(other)).expect(404);
      await choose(other, exam.id, 1, 1).expect(404);
      await h.http().post(`${exams}/${exam.id}/finish`).set(bearer(other)).expect(404);
      expect((await h.http().get(exams).set(bearer(other)).expect(200)).body.items).toEqual([]);
    });

    it('hides every answer until the end, keeps the clock, and then explains each question', async () => {
      const topic = subspecialties[5]!;
      for (let i = 0; i < 3; i += 1) await published(question({ subspecialtyId: topic.id }));
      const me = await person();
      const started = await start(me, { size: 10, subspecialties: [topic.key] }).expect(201);
      const exam = started.body;
      // Fewer questions than asked for match: the exam has what there is, 90 seconds each.
      expect(exam.total).toBeGreaterThanOrEqual(3);
      expect(exam.total).toBeLessThanOrEqual(10);
      expect(Date.parse(exam.endsAt) - Date.parse(exam.startedAt)).toBe(exam.total * 90_000);
      expect(exam).toMatchObject({ status: 'RUNNING', correct: null, answered: 0 });
      for (const item of exam.questions) {
        expect(item).toMatchObject({ correctPosition: null, summary: null, references: [] });
        for (const option of item.options) {
          expect(option).toMatchObject({ correct: null, explanation: null });
        }
      }

      // The first option is right in this file's questions.
      await choose(me, exam.id, 1, 2).expect(204);
      await choose(me, exam.id, 1, 1).expect(204);
      await choose(me, exam.id, 2, 2).expect(204);
      await choose(me, exam.id, 3, 9).expect(400);
      await choose(me, exam.id, 99, 1).expect(404);
      const running = await h.http().get(`${exams}/${exam.id}`).set(bearer(me)).expect(200);
      expect(running.body).toMatchObject({ status: 'RUNNING', answered: 2, correct: null });
      expect(running.body.questions[0]).toMatchObject({ chosenPosition: 1, correctPosition: null });

      const done = await h
        .http()
        .post(`${exams}/${exam.id}/finish`)
        .query({ locale: 'en' })
        .set(bearer(me))
        .expect(200);
      expect(done.body).toMatchObject({ status: 'FINISHED', answered: 2, correct: 1 });
      expect(done.body.questions[0]).toMatchObject({ chosenPosition: 1, correctPosition: 1 });
      expect(done.body.questions[0].options[0]).toMatchObject({ correct: true });
      expect(done.body.questions[0].options[0].explanation).toMatch(/^Why 1/);
      expect(done.body.questions[0].summary).toMatch(/^Summary/);
      // Over: no more answers.
      await choose(me, exam.id, 3, 1)
        .expect(409)
        .expect((res) => expect(res.body.error.details[0].code).toBe('mockExamOver'));

      // Its answers count like practice, marked with the exam: the first one counts.
      const results = await h.http().get('/api/v1/me/exam-results').set(bearer(me)).expect(200);
      expect(results.body).toMatchObject({ answered: 2, correct: 1 });
      const list = await h.http().get(exams).set(bearer(me)).expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({ id: exam.id, status: 'FINISHED', total: exam.total, correct: 1 }),
      ]);
    });

    it('refuses an answer after the time, and closes itself when its time is up', async () => {
      await published(question({ subspecialtyId: subspecialties[6]!.id }));
      const me = await person();
      const exam = (
        await start(me, { size: 10, subspecialties: [subspecialties[6]!.key] }).expect(201)
      ).body;
      await choose(me, exam.id, 1, 1).expect(204);
      await age(exam.id, exam.total * 90 + 5);
      await choose(me, exam.id, 1, 2)
        .expect(409)
        .expect((res) => expect(res.body.error.details[0].code).toBe('mockExamOver'));
      const closed = await h.http().get(`${exams}/${exam.id}`).set(bearer(me)).expect(200);
      // The answer given in time stands; the late one never replaced it.
      expect(closed.body).toMatchObject({ status: 'FINISHED', correct: 1 });
      expect(closed.body.questions[0].chosenPosition).toBe(1);
      expect(Date.parse(closed.body.finishedAt)).toBe(Date.parse(closed.body.endsAt));

      // An exam nobody opens again is closed when the list is read.
      const left = (
        await start(me, { size: 10, subspecialties: [subspecialties[6]!.key] }).expect(201)
      ).body;
      await choose(me, left.id, 1, 2).expect(204);
      await age(left.id, left.total * 90 + 5);
      const list = await h.http().get(exams).set(bearer(me)).expect(200);
      expect(list.body.items[0]).toMatchObject({ id: left.id, status: 'FINISHED', correct: 0 });
    });
  });
});
