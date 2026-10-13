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
  verifyPhysician,
} from './auth-harness';

/**
 * M6 checkpoint 4: the exam question demo. The questions here are made up for the test and say
 * nothing medical.
 */
describe('exam questions (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string };
  let reviewer: { accessToken: string };
  let types: Record<string, string>;
  let subspecialty: { id: string; key: string };
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    editor = await signInWithMfa(h, 'exam-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );
    reviewer = await signInAdmin(h, 'exam-reviewer');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    // One subspecialty for this file's questions, so "next" can be narrowed to them.
    const subs = await h.http().get('/api/v1/subspecialties').expect(200);
    subspecialty = subs.body.items[2];
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  /** Four options; the second is the right one. */
  const question = (extra: Record<string, unknown> = {}) => {
    const tag = `${run}-${++n}`;
    return {
      level: 'RESIDENT',
      subspecialtyId: subspecialty.id,
      translations: {
        he: { stem: `שאלה לדוגמה ${tag}: מהי התשובה?`, summary: `סיכום הנושא ${tag}.` },
        en: { stem: `Sample question ${tag}: which one?`, summary: `Topic summary ${tag}.` },
      },
      options: ['א', 'ב', 'ג', 'ד'].map((letter, index) => ({
        correct: index === 1,
        translations: {
          he: {
            text: `תשובה ${letter} ${tag}`,
            explanation: index === 1 ? `נכון, כי ${tag}.` : `שגוי, כי ${letter} ${tag}.`,
          },
          en: {
            text: `Option ${index + 1} ${tag}`,
            explanation: index === 1 ? `Right, because ${tag}.` : `Wrong, because ${index + 1}.`,
          },
        },
      })),
      ...extra,
    };
  };
  const create = async (body: Record<string, unknown> = question()) =>
    (await h.http().post('/api/v1/admin/exam-questions').set(as(editor)).send(body).expect(201))
      .body as { id: string; version: number };
  const step = (who: { accessToken: string }, id: string, body: object) =>
    h.http().post(`/api/v1/admin/exam-questions/${id}/transitions`).set(as(who)).send(body);
  async function published(body?: Record<string, unknown>) {
    const item = await create(body);
    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    return item;
  }
  type Call = ReturnType<ReturnType<Harness['http']>['get']>;
  const withToken = (req: Call, token: string | null): Call =>
    token ? req.set(bearer(token)) : req;
  const answer = (token: string | null, id: string, position: number, locale = 'he') =>
    withToken(h.http().post(`/api/v1/exam-questions/${id}/answer`), token).send({
      position,
      locale,
    });
  const person = async () => (await signIn(h, await createVerifiedUser(h, 'student'))).accessToken;

  it('is for staff only', async () => {
    const item = await create();
    await expectAdminOnly(h, 'get', '/api/v1/admin/exam-questions');
    await expectAdminOnly(h, 'post', '/api/v1/admin/exam-questions', question());
    await expectAdminOnly(h, 'get', `/api/v1/admin/exam-questions/${item.id}`);
    await expectAdminOnly(h, 'put', `/api/v1/admin/exam-questions/${item.id}`, question());
    await expectAdminOnly(h, 'delete', `/api/v1/admin/exam-questions/${item.id}`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/exam-questions/${item.id}/transitions`, {
      action: 'SUBMIT',
    });
    await expectAdminOnly(h, 'get', `/api/v1/admin/exam-questions/${item.id}/history`);
    await h.http().get('/api/v1/me/exam-results').expect(401);
  });

  it('says what a question still needs before review', async () => {
    const code = async (body: Record<string, unknown>) => {
      const item = await create(body);
      const res = await step(editor, item.id, { action: 'SUBMIT' }).expect(422);
      return res.body.error.details[0].code as string;
    };
    const base = question();
    const options = base.options;
    const without = (index: number, key: 'text' | 'explanation') =>
      options.map((option, i) =>
        i === index
          ? { ...option, translations: { he: { ...option.translations.he, [key]: undefined } } }
          : option,
      );

    expect(await code(question({ options: options.map((o) => ({ ...o, correct: false })) }))).toBe(
      'examOneCorrectOption',
    );
    expect(
      await code(
        question({
          options: without(2, 'explanation').map((o, i) =>
            i === 2 ? { ...o, translations: { he: { text: 'תשובה בלי הסבר' } } } : o,
          ),
        }),
      ),
    ).toBe('examExplanationRequired');
    expect(await code(question({ translations: { he: { stem: `שאלה בלי סיכום ${run}` } } }))).toBe(
      'examSummaryRequired',
    );
    expect(
      await code(question({ translations: { en: { stem: `English only ${run}`, summary: 'x' } } })),
    ).toBe('examStemRequired');

    // Two right options, one option only, and seven options never get saved at all.
    const post = (body: Record<string, unknown>) =>
      h.http().post('/api/v1/admin/exam-questions').set(as(editor)).send(body);
    await post(question({ options: options.map((o) => ({ ...o, correct: true })) })).expect(400);
    await post(question({ options: options.slice(0, 1) })).expect(400);
    await post(question({ options: [...options, ...options].slice(0, 7) })).expect(400);
  });

  it('runs the review workflow with four eyes, and lets the reviewer correct in review', async () => {
    const body = question();
    const item = await create(body);
    await step(editor, item.id, { action: 'PUBLISH' }).expect(403);
    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);

    const put = (who: { accessToken: string }, version: number, changed: object) =>
      h
        .http()
        .put(`/api/v1/admin/exam-questions/${item.id}`)
        .set(as(who))
        .set('If-Match', `"${version}"`)
        .send(changed);
    await put(editor, 2, body).expect(422);
    await put(reviewer, 7, body).expect(412);
    const corrected = await put(reviewer, 2, {
      ...body,
      translations: { he: { stem: `שאלה מתוקנת ${run}`, summary: 'סיכום מתוקן.' } },
    }).expect(200);
    expect(corrected.body.translations.he.stem).toBe(`שאלה מתוקנת ${run}`);

    const own = (
      await h
        .http()
        .post('/api/v1/admin/exam-questions')
        .set(as(reviewer))
        .send(question())
        .expect(201)
    ).body as { id: string };
    await step(reviewer, own.id, { action: 'SUBMIT' }).expect(200);
    const blocked = await step(reviewer, own.id, { action: 'PUBLISH' }).expect(403);
    expect(blocked.body.error.details[0].code).toBe('ownSubmission');

    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    const history = await h
      .http()
      .get(`/api/v1/admin/exam-questions/${item.id}/history`)
      .set(as(reviewer))
      .expect(200);
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'SUBMIT',
      'correct',
      'PUBLISH',
    ]);
    await expect(
      h.db.query(`DELETE FROM exam_question_history WHERE question_id = $1`, [item.id]),
    ).rejects.toThrow(/append-only/);
  });

  it('asks a question without giving away the answer', async () => {
    const item = await published();
    const res = await h
      .http()
      .get(`/api/v1/exam-questions/next?subspecialty=${subspecialty.key}&locale=en`)
      .expect(200);
    expect(res.body.question).not.toBeNull();
    const asked = res.body.question as { id: string; options: object[] };
    expect(Object.keys(asked).sort()).toEqual(
      ['id', 'level', 'locale', 'options', 'stem', 'subspecialty'].sort(),
    );
    for (const option of asked.options) {
      expect(Object.keys(option).sort()).toEqual(['position', 'text']);
    }
    // Nothing in the whole reply names the right option, an explanation or the summary.
    const raw = JSON.stringify(res.body);
    for (const word of ['correct', 'explanation', 'summary', 'because', 'Topic summary']) {
      expect(raw).not.toContain(word);
    }
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('after an answer: the right option, why each option is right or wrong, and the summary', async () => {
    const body = question();
    const item = await published(body);
    const wrong = await answer(null, item.id, 3, 'en').expect(200);
    expect(wrong.body).toMatchObject({
      correct: false,
      chosenPosition: 3,
      correctPosition: 2,
      summary: body.translations.en.summary,
      saved: false,
      countsForScore: false,
    });
    expect(wrong.body.options).toEqual(
      body.options.map((option, index) => ({
        position: index + 1,
        text: option.translations.en.text,
        correct: index === 1,
        explanation: option.translations.en.explanation,
      })),
    );
    // Every option carries its explanation, the wrong ones too.
    expect(wrong.body.options.every((o: { explanation: string }) => o.explanation.length > 0)).toBe(
      true,
    );
    const right = await answer(null, item.id, 2, 'he').expect(200);
    expect(right.body).toMatchObject({ correct: true, summary: body.translations.he.summary });
    await answer(null, item.id, 6).expect(400);
    await answer(null, item.id, 0).expect(400);
  });

  it('serves only published questions, and each one once per visit', async () => {
    const key = subspecialty.key;
    const draft = await create();
    const inReview = await create();
    await step(editor, inReview.id, { action: 'SUBMIT' }).expect(200);
    for (const hidden of [draft, inReview]) await answer(null, hidden.id, 1).expect(404);

    const first = await published(question({ level: 'EXPERT' }));
    const second = await published(question({ level: 'EXPERT' }));
    const seen: string[] = [];
    const next = async () => {
      const res = await h
        .http()
        .get(
          `/api/v1/exam-questions/next?subspecialty=${key}&level=EXPERT&exclude=${seen.join(',')}`,
        )
        .expect(200);
      return res.body as { question: { id: string } | null; remaining: number };
    };
    // Everything earlier in this file (and earlier runs) is level RESIDENT, so EXPERT narrows
    // the set to these two, plus any EXPERT ones left by earlier runs.
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const res = await next();
      if (!res.question) break;
      expect(seen).not.toContain(res.question.id);
      seen.push(res.question.id);
      ids.add(res.question.id);
    }
    expect(ids.has(first.id)).toBe(true);
    expect(ids.has(second.id)).toBe(true);
    expect(ids.has(draft.id)).toBe(false);
    expect((await next()).question).toBeNull();

    // An archived question is no longer asked or answerable.
    await step(reviewer, first.id, { action: 'ARCHIVE' }).expect(200);
    await answer(null, first.id, 1).expect(404);
    await h.http().get('/api/v1/exam-questions/next?exclude=not-an-id').expect(400);
  });

  it('saves a signed-in person’s answers; the first answer counts; results are their own', async () => {
    const [a, b] = [await published(), await published()];
    const me = await person();
    const other = await person();

    const first = await answer(me, a.id, 1).expect(200);
    expect(first.body).toMatchObject({ correct: false, saved: true, countsForScore: true });
    const again = await answer(me, a.id, 2).expect(200);
    expect(again.body).toMatchObject({ correct: true, saved: true, countsForScore: false });
    await answer(me, b.id, 2).expect(200);
    await answer(other, a.id, 2).expect(200);

    const mine = await h
      .http()
      .get('/api/v1/me/exam-results?locale=en')
      .set(bearer(me))
      .expect(200);
    expect(mine.body).toMatchObject({ answered: 2, correct: 1, percent: 50 });
    expect(mine.body.items).toHaveLength(2);
    const lineA = mine.body.items.find((i: { questionId: string }) => i.questionId === a.id);
    expect(lineA).toMatchObject({ firstCorrect: false, attempts: 2 });
    expect(lineA.stem).toContain('Sample question');
    // Results never include the right answer.
    expect(JSON.stringify(mine.body)).not.toContain('explanation');

    const theirs = await h.http().get('/api/v1/me/exam-results').set(bearer(other)).expect(200);
    expect(theirs.body).toMatchObject({ answered: 1, correct: 1, percent: 100 });

    // A visitor's answer is not stored.
    const before = await h.db.query('SELECT count(*)::int AS n FROM exam_answers');
    await answer(null, a.id, 2).expect(200);
    const after = await h.db.query('SELECT count(*)::int AS n FROM exam_answers');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  describe('access tiers', () => {
    const ids: Record<'public' | 'verified' | 'full', string> = {
      public: '',
      verified: '',
      full: '',
    };
    const readers: Record<string, string | null> = {};

    async function member(typeKey: string, then?: 'suspend'): Promise<string> {
      const email = await createVerifiedUser(h, 'reader');
      const created = await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(as(reviewer))
        .send({
          email,
          typeId: types[typeKey],
          ...(typeKey === 'FULL_MEMBER'
            ? { identifier: String(300_000_000 + Math.floor(Math.random() * 600_000_000)) }
            : {}),
        })
        .expect(201);
      if (then) {
        await h
          .http()
          .post(`/api/v1/admin/memberships/${created.body.membership.id}/${then}`)
          .set(as(reviewer))
          .send({ reason: 'Test' })
          .expect(200);
      }
      return (await signIn(h, email)).accessToken;
    }

    beforeAll(async () => {
      // Level STUDENT narrows "next" to this block's three questions (and earlier runs').
      ids.public = (await published(question({ level: 'STUDENT' }))).id;
      ids.verified = (await published(question({ level: 'STUDENT', accessTier: 'VERIFIED' }))).id;
      ids.full = (
        await published(
          question({ level: 'STUDENT', accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] }),
        )
      ).id;
      readers.anonymous = null;
      // An account the platform does not know as a physician's.
      readers.noMembership = await person();
      // A physician the platform knows, in no organisation.
      const verifiedEmail = await createVerifiedUser(h, 'reader');
      await verifyPhysician(h, verifiedEmail);
      readers.verified = (await signIn(h, verifiedEmail)).accessToken;
      readers.full = await member('FULL_MEMBER');
      readers.student = await member('STUDENT');
      readers.suspended = await member('FULL_MEMBER', 'suspend');
    });

    const expected: Record<string, ('public' | 'verified' | 'full')[]> = {
      anonymous: ['public'],
      noMembership: ['public'],
      verified: ['public', 'verified'],
      full: ['public', 'verified', 'full'],
      student: ['public', 'verified'],
      suspended: ['public', 'verified'],
    };

    for (const [who, visible] of Object.entries(expected)) {
      it(`${who}: is asked and may answer ${visible.join(', ')}, and nothing else`, async () => {
        const token = readers[who]!;
        // Everything "next" would offer this reader, by asking until nothing is left.
        const offered: string[] = [];
        for (let i = 0; i < 200; i++) {
          const res = await withToken(
            h
              .http()
              .get(
                `/api/v1/exam-questions/next?subspecialty=${subspecialty.key}&level=STUDENT&exclude=${offered.join(',')}`,
              ),
            token,
          ).expect(200);
          if (!res.body.question) break;
          offered.push(res.body.question.id);
        }
        for (const name of ['public', 'verified', 'full'] as const) {
          const shown = visible.includes(name);
          expect(offered.includes(ids[name])).toBe(shown);
          const res = await answer(token, ids[name], 2);
          expect(res.status).toBe(shown ? 200 : 404);
        }
      });
    }
  });
});
