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

/** M6 checkpoints 1–3: education items, the review workflow, courses and the public library. */
describe('education (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string; email: string };
  let reviewer: { accessToken: string };
  let types: Record<string, string>;
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    let editorEmail = '';
    const signedIn = await signInWithMfa(h, 'edu-editor', (email) => {
      editorEmail = email;
      return grantRole(h, email, 'CONTENT_EDITOR');
    });
    editor = { accessToken: signedIn.accessToken, email: editorEmail };
    reviewer = await signInAdmin(h, 'edu-reviewer');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  const article = (extra: Record<string, unknown> = {}) => ({
    type: 'ARTICLE',
    level: 'RESIDENT',
    durationMinutes: 10,
    cmePoints: 0.5,
    translations: {
      he: { title: `מאמר לדוגמה ${run} ${++n}`, description: 'טקסט המאמר.', author: 'כותב בדוי' },
    },
    ...extra,
  });
  const create = async (body: Record<string, unknown> = article()) =>
    (await h.http().post('/api/v1/admin/education').set(as(editor)).send(body).expect(201))
      .body as { id: string; slug: string; version: number; status: string };
  const step = (who: { accessToken: string }, id: string, body: object) =>
    h.http().post(`/api/v1/admin/education/${id}/transitions`).set(as(who)).send(body);
  /** Written by the editor, approved by the reviewer. */
  async function published(body?: Record<string, unknown>) {
    const item = await create(body);
    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    return item;
  }
  const pdf = async () =>
    (
      await h
        .http()
        .post('/api/v1/files')
        .set(as(editor))
        .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'handout.pdf')
        .expect(201)
    ).body.id as string;
  const read = (token: string | null, path: string) => {
    const req = h.http().get(path);
    return token ? req.set(bearer(token)) : req;
  };
  const publicPath = (slug: string) => `/api/v1/education/${encodeURIComponent(slug)}`;

  it('is for staff only', async () => {
    const item = await create();
    await expectAdminOnly(h, 'get', '/api/v1/admin/education');
    await expectAdminOnly(h, 'post', '/api/v1/admin/education', article());
    await expectAdminOnly(h, 'get', `/api/v1/admin/education/${item.id}`);
    await expectAdminOnly(h, 'put', `/api/v1/admin/education/${item.id}`, article());
    await expectAdminOnly(h, 'delete', `/api/v1/admin/education/${item.id}`);
    await expectAdminOnly(h, 'put', `/api/v1/admin/education/${item.id}/lessons`, {
      lessonIds: [],
    });
    await expectAdminOnly(h, 'post', `/api/v1/admin/education/${item.id}/transitions`, {
      action: 'SUBMIT',
    });
    await expectAdminOnly(h, 'get', `/api/v1/admin/education/${item.id}/history`);
    // An event admin has no business here.
    const eventAdmin = await signInWithMfa(h, 'event-admin', (email) =>
      grantRole(h, email, 'EVENT_ADMIN'),
    );
    await h.http().get('/api/v1/admin/education').set(as(eventAdmin)).expect(403);
  });

  it('creates a draft with cleaned text, and keeps it out of the library', async () => {
    const res = await h
      .http()
      .post('/api/v1/admin/education')
      .set(as(editor))
      .send(
        article({
          translations: {
            he: {
              title: `מאמר נקי ${run}`,
              description: 'טקסט <script>alert(1)</script>**מודגש**',
            },
          },
        }),
      )
      .expect(201);
    expect(res.headers.etag).toBe('"1"');
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      type: 'ARTICLE',
      slug: `מאמר-נקי-${run}`,
      level: 'RESIDENT',
      cmePoints: 0.5,
      videoStatus: 'NONE',
      accessTier: 'PUBLIC',
    });
    expect(res.body.translations.he.description).not.toContain('script');
    await read(null, publicPath(res.body.slug)).expect(404);
  });

  it('validates links, files, tiers and numbers', async () => {
    const post = (extra: Record<string, unknown>) =>
      h.http().post('/api/v1/admin/education').set(as(editor)).send(article(extra));
    await post({ type: 'VIDEO', externalUrl: 'javascript:alert(1)' }).expect(400);
    await post({ type: 'LECTURE' }).expect(400);
    await post({ accessTier: 'TYPES' }).expect(400);
    await post({ durationMinutes: 0 }).expect(400);
    await post({ cmePoints: -1 }).expect(400);
    await post({ translations: {} }).expect(400);
    const file = await post({ fileIds: ['018f0000-0000-7000-8000-000000000000'] }).expect(400);
    expect(file.body.error.details[0].code).toBe('unknownFile');
  });

  it('says what each type still needs before review', async () => {
    const submit = async (body: Record<string, unknown>) => {
      const item = await create(body);
      return step(editor, item.id, { action: 'SUBMIT' });
    };
    const code = async (body: Record<string, unknown>) =>
      (await submit(body)).body.error.details[0].code as string;

    expect(await code(article({ type: 'VIDEO' }))).toBe('educationLinkRequired');
    expect(await code(article({ type: 'PDF' }))).toBe('educationFileRequired');
    expect(await code(article({ type: 'COURSE' }))).toBe('educationLessonsRequired');
    expect(
      await code(article({ translations: { he: { title: `ללא טקסט ${run}`, description: '' } } })),
    ).toBe('educationTextRequired');
    expect(await code(article({ translations: { en: { title: `English only ${run}` } } }))).toBe(
      'educationHebrewRequired',
    );

    // A video with a link, a video marked as pending, and a PDF with its file are all ready.
    const linked = await submit(
      article({ type: 'VIDEO', externalUrl: 'https://videos.example.test/watch/1' }),
    );
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ videoStatus: 'EXTERNAL', status: 'IN_REVIEW' });
    const pending = await submit(article({ type: 'SURGICAL_VIDEO', videoPending: true }));
    expect(pending.body).toMatchObject({ videoStatus: 'PENDING_PROVIDER', externalUrl: null });
    expect((await submit(article({ type: 'PDF', fileIds: [await pdf()] }))).status).toBe(200);
  });

  it('runs draft → review → back → review → published, with four eyes and emails', async () => {
    const item = await create();
    await step(editor, item.id, { action: 'PUBLISH' }).expect(403);
    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);

    // The editor can no longer change it, but the reviewer may correct it.
    const put = (who: { accessToken: string }, version: number, body: object) =>
      h
        .http()
        .put(`/api/v1/admin/education/${item.id}`)
        .set(as(who))
        .set('If-Match', `"${version}"`)
        .send(body);
    const locked = await put(editor, 2, article()).expect(422);
    expect(locked.body.error.details[0].code).toBe('educationNotEditable');
    const corrected = await put(
      reviewer,
      2,
      article({ translations: { he: { title: `מאמר מתוקן ${run}`, description: 'טקסט מתוקן.' } } }),
    ).expect(200);
    expect(corrected.body.translations.he.title).toBe(`מאמר מתוקן ${run}`);
    expect(corrected.body.status).toBe('IN_REVIEW');

    await step(reviewer, item.id, { action: 'SEND_BACK' }).expect(400);
    await step(reviewer, item.id, { action: 'SEND_BACK', comment: 'נא להוסיף מקור' }).expect(200);
    expect(h.mailer.last(editor.email, 'educationSentBack')?.params).toMatchObject({
      reason: 'נא להוסיף מקור',
    });

    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    const done = await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    expect(done.body.status).toBe('PUBLISHED');
    expect(done.body.publishedAt).not.toBeNull();
    expect(h.mailer.last(editor.email, 'educationPublished')).toBeDefined();
    await read(null, publicPath(item.slug)).expect(200);

    const history = await h
      .http()
      .get(`/api/v1/admin/education/${item.id}/history`)
      .set(as(reviewer))
      .expect(200);
    expect(history.body.items.map((i: { action: string }) => i.action)).toEqual([
      'create',
      'SUBMIT',
      'correct',
      'SEND_BACK',
      'SUBMIT',
      'PUBLISH',
    ]);
    await expect(
      h.db.query(`UPDATE education_history SET comment = 'x' WHERE item_id = $1`, [item.id]),
    ).rejects.toThrow(/append-only/);
  });

  it('never lets the submitter approve their own item', async () => {
    const own = (
      await h.http().post('/api/v1/admin/education').set(as(reviewer)).send(article()).expect(201)
    ).body as { id: string };
    await step(reviewer, own.id, { action: 'SUBMIT' }).expect(200);
    const res = await step(reviewer, own.id, { action: 'PUBLISH' }).expect(403);
    expect(res.body.error.details[0].code).toBe('ownSubmission');
  });

  it('takes a published item down to edit it, keeps its first date, and archives', async () => {
    const item = await published();
    const first = (await read(null, publicPath(item.slug)).expect(200)).body.publishedAt as string;

    await step(editor, item.id, { action: 'TAKE_DOWN' }).expect(403);
    await step(reviewer, item.id, { action: 'TAKE_DOWN' }).expect(200);
    await read(null, publicPath(item.slug)).expect(404);
    // A published item can't be deleted even while it is back in draft.
    const del = await h
      .http()
      .delete(`/api/v1/admin/education/${item.id}`)
      .set(as(editor))
      .expect(422);
    expect(del.body.error.details[0].code).toBe('educationNotDeletable');

    await step(editor, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    const again = await read(null, publicPath(item.slug)).expect(200);
    expect(again.body.publishedAt).toBe(first);

    await step(reviewer, item.id, { action: 'ARCHIVE' }).expect(200);
    const archived = await read(null, publicPath(item.slug)).expect(200);
    expect(archived.body.archived).toBe(true);
    const list = await read(null, '/api/v1/education?pageSize=50').expect(200);
    expect(list.body.items.map((i: { slug: string }) => i.slug)).not.toContain(item.slug);
  });

  it('saves only with the current version, never changes the type, and deletes drafts', async () => {
    const item = await create();
    const put = (version: string | null, body: object) => {
      const req = h.http().put(`/api/v1/admin/education/${item.id}`).set(as(editor));
      return (version ? req.set('If-Match', version) : req).send(body);
    };
    await put(null, article()).expect(412);
    await put('"9"', article()).expect(412);
    const type = await put('"1"', article({ type: 'CASE' })).expect(400);
    expect(type.body.error.details[0].code).toBe('educationTypeFixed');
    expect((await put('"1"', article({ level: 'EXPERT' })).expect(200)).body).toMatchObject({
      level: 'EXPERT',
      version: 2,
    });
    await h.http().delete(`/api/v1/admin/education/${item.id}`).set(as(editor)).expect(204);
    await h.http().get(`/api/v1/admin/education/${item.id}`).set(as(editor)).expect(404);
  });

  it('shows a published item with its file, in the library with filters', async () => {
    const fileId = await pdf();
    const subs = await h.http().get('/api/v1/subspecialties').expect(200);
    const subspecialty = subs.body.items[0] as { id: string; key: string };
    const item = await published(
      article({
        type: 'PDF',
        level: 'FELLOW',
        subspecialtyId: subspecialty.id,
        fileIds: [fileId],
        references: [{ title: 'מקור לדוגמה', url: 'https://papers.example.test/1' }],
      }),
    );
    const res = await read(null, `${publicPath(item.slug)}?locale=en`).expect(200);
    expect(res.body).toMatchObject({
      type: 'PDF',
      level: 'FELLOW',
      locale: 'he',
      fallback: true,
      archived: false,
      author: 'כותב בדוי',
      subspecialty: { key: subspecialty.key },
      files: [{ id: fileId, originalName: 'handout.pdf' }],
      references: [{ title: 'מקור לדוגמה' }],
      lessons: [],
    });
    await read(null, `/api/v1/files/${fileId}/url`).expect(200);

    const slugs = async (query: string) =>
      (
        (await read(null, `/api/v1/education?pageSize=50&${query}`).expect(200)).body.items as {
          slug: string;
        }[]
      ).map((i) => i.slug);
    expect(await slugs(`type=PDF&subspecialty=${subspecialty.key}`)).toContain(item.slug);
    expect(await slugs('type=ARTICLE')).not.toContain(item.slug);
    expect(await slugs('level=FELLOW')).toContain(item.slug);
    expect(await slugs('level=STUDENT')).not.toContain(item.slug);
  });

  describe('courses', () => {
    it('keeps lessons in order, refuses a course as a lesson, and locks hidden lessons', async () => {
      const open = await published();
      const membersOnly = await published(article({ accessTier: 'MEMBERS' }));
      const draft = await create();
      const another = await create(article({ type: 'COURSE' }));
      const course = await create(article({ type: 'COURSE' }));
      const lessons = (lessonIds: string[]) =>
        h
          .http()
          .put(`/api/v1/admin/education/${course.id}/lessons`)
          .set(as(editor))
          .send({ lessonIds });

      const nested = await lessons([another.id]).expect(400);
      expect(nested.body.error.details[0].code).toBe('courseAsLesson');
      await lessons(['018f0000-0000-7000-8000-000000000000']).expect(400);
      const notCourse = await h
        .http()
        .put(`/api/v1/admin/education/${open.id}/lessons`)
        .set(as(reviewer))
        .send({ lessonIds: [] })
        .expect(422);
      expect(notCourse.body.error.details[0].code).toBe('educationNotACourse');

      const set = await lessons([membersOnly.id, draft.id, open.id]).expect(200);
      expect(set.body.lessonIds).toEqual([membersOnly.id, draft.id, open.id]);
      await step(editor, course.id, { action: 'SUBMIT' }).expect(200);
      await step(reviewer, course.id, { action: 'PUBLISH' }).expect(200);

      // A visitor: the members-only lesson is locked, the draft is left out, the order is kept.
      const visitor = await read(null, publicPath(course.slug)).expect(200);
      expect(visitor.body.lessons).toEqual([
        { position: 1, locked: true, slug: null, type: null, title: null, durationMinutes: null },
        expect.objectContaining({ position: 2, locked: false, slug: open.slug, type: 'ARTICLE' }),
      ]);
      // The database refuses a course as a lesson too.
      await expect(
        h.db.query('INSERT INTO course_items (course_id, item_id, position) VALUES ($1, $2, 9)', [
          course.id,
          another.id,
        ]),
      ).rejects.toThrow(/cannot be a lesson/);
    });
  });

  describe('access tiers', () => {
    const slugs: Record<'public' | 'members' | 'full', string> = {
      public: '',
      members: '',
      full: '',
    };
    const readers: Record<string, string | null> = {};
    let membersFile = '';
    let subKey = '';

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
      // A subspecialty and a type narrow the list to this run's three items (newest first).
      const subs = await h.http().get('/api/v1/subspecialties').expect(200);
      const subspecialty = subs.body.items[1] as { id: string; key: string };
      subKey = subspecialty.key;
      membersFile = await pdf();
      const base = { type: 'CASE', subspecialtyId: subspecialty.id };
      slugs.public = (await published(article(base))).slug;
      slugs.members = (
        await published(article({ ...base, accessTier: 'MEMBERS', fileIds: [membersFile] }))
      ).slug;
      slugs.full = (
        await published(article({ ...base, accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] }))
      ).slug;
      readers.anonymous = null;
      readers.noMembership = (await signIn(h, await createVerifiedUser(h, 'reader'))).accessToken;
      readers.full = await member('FULL_MEMBER');
      readers.student = await member('STUDENT');
      readers.suspended = await member('FULL_MEMBER', 'suspend');
    });

    const expected: Record<string, ('public' | 'members' | 'full')[]> = {
      anonymous: ['public'],
      noMembership: ['public'],
      full: ['public', 'members', 'full'],
      student: ['public', 'members'],
      suspended: ['public'],
    };

    for (const [who, visible] of Object.entries(expected)) {
      it(`${who}: sees ${visible.join(', ')} in the list and by link, and nothing else`, async () => {
        const list = await read(
          readers[who]!,
          `/api/v1/education?type=CASE&subspecialty=${subKey}&pageSize=50`,
        ).expect(200);
        const listed = (list.body.items as { slug: string }[]).map((i) => i.slug);
        for (const name of ['public', 'members', 'full'] as const) {
          const shown = visible.includes(name);
          expect(listed.includes(slugs[name])).toBe(shown);
          const res = await read(readers[who]!, publicPath(slugs[name]));
          expect(res.status).toBe(shown ? 200 : 404);
        }
        // The file of the members-only item follows the item.
        const file = await read(readers[who]!, `/api/v1/files/${membersFile}/url`);
        expect(file.status).toBe(visible.includes('members') ? 200 : 404);
      });
    }
  });
});
