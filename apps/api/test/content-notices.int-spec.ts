import { ContentAnnouncer } from '../src/modules/notifications';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M7 checkpoint 2: notices about newly published content, the daily summary email and the
 * "stop these emails" link. A person only sees announcements made after their account was
 * created, so each test makes its own people.
 */
describe('notices about new content (integration)', () => {
  let h: Harness;
  let announcer: ContentAnnouncer;
  let editor: { email: string; accessToken: string };
  let admin: { accessToken: string };
  let types: Record<string, string>;
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    announcer = h.app.get(ContentAnnouncer);
    editor = await signInWithMfa(h, 'notice-editor', (email) =>
      // The organisation's news, and the platform's library.
      Promise.all([
        grantRole(h, email, 'CONTENT_EDITOR'),
        grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
      ]).then(() => undefined),
    );
    admin = await signInAdmin(h, 'notice-admin');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  /** Written by the editor, published by the admin. */
  async function news(extra: object = {}) {
    const title = `ידיעה חדשה ${run} ${++n}`;
    const created = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send({
        organisationId: DEFAULT_ORGANISATION,
        translations: { he: { title, body: 'גוף', summary: 'תקציר' } },
        ...extra,
      })
      .expect(201);
    const step = (who: { accessToken: string }, action: string) =>
      h
        .http()
        .post(`/api/v1/admin/news/${created.body.id}/transitions`)
        .set(as(who))
        .send({ action })
        .expect(200);
    await step(editor, 'SUBMIT');
    await step(admin, 'PUBLISH');
    return { id: created.body.id as string, title, link: `/news/${created.body.slug}` };
  }
  async function event() {
    const title = `אירוע חדש ${run} ${++n}`;
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as(admin))
      .send({
        organisationId: DEFAULT_ORGANISATION,
        startAt: new Date(Date.UTC(2031, 5, 10, 7)).toISOString(),
        endAt: new Date(Date.UTC(2031, 5, 10, 16)).toISOString(),
        locationName: 'Example Hall',
        registrationMode: 'INTERNAL',
        translations: { he: { title } },
      })
      .expect(201);
    await h
      .http()
      .post(`/api/v1/admin/events/${created.body.id}/publish`)
      .set(as(admin))
      .expect(200);
    return { id: created.body.id as string, title, link: `/events/${created.body.slug}` };
  }
  const educationStep = (who: { accessToken: string }, id: string, action: string) =>
    h
      .http()
      .post(`/api/v1/admin/education/${id}/transitions`)
      .set(as(who))
      .send({ action })
      .expect(200);
  async function education() {
    const title = `מאמר חדש ${run} ${++n}`;
    const created = await h
      .http()
      .post('/api/v1/admin/education')
      .set(as(editor))
      .send({ type: 'ARTICLE', translations: { he: { title, description: 'טקסט המאמר.' } } })
      .expect(201);
    await educationStep(editor, created.body.id, 'SUBMIT');
    await educationStep(admin, created.body.id, 'PUBLISH');
    return { id: created.body.id as string, title, link: `/education/${created.body.slug}` };
  }
  async function person(label = 'reader') {
    const email = await createVerifiedUser(h, label);
    return { email, token: (await signIn(h, email)).accessToken };
  }
  async function member(typeKey: string, then?: 'suspend') {
    const email = await createVerifiedUser(h, 'member');
    const created = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as(admin))
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
        .post(`/api/v1/admin/memberships/${created.body.membership.id}/suspend`)
        .set(as(admin))
        .send({ reason: 'Test' })
        .expect(200);
    }
    return { email, token: (await signIn(h, email)).accessToken };
  }
  interface Item {
    id: string;
    kind: string;
    type: string;
    params: Record<string, string>;
    link: string | null;
    readAt: string | null;
  }
  const list = async (token: string) =>
    (await h.http().get('/api/v1/notifications?pageSize=50').set(bearer(token)).expect(200))
      .body as { items: Item[]; total: number; unread: number };
  const links = async (token: string) => (await list(token)).items.map((item) => item.link);
  const unread = async (token: string) =>
    (await h.http().get('/api/v1/notifications/unread-count').set(bearer(token)).expect(200)).body
      .unread as number;
  const setPreferences = (token: string, items: object[]) =>
    h.http().put('/api/v1/me/notification-preferences').set(bearer(token)).send({ items });
  const preferences = async (token: string) =>
    Object.fromEntries(
      (
        (await h.http().get('/api/v1/me/notification-preferences').set(bearer(token)).expect(200))
          .body.items as { kind: string; app: boolean; email: boolean }[]
      ).map((item) => [item.kind, item]),
    );
  const tokenOf = (link: string) => new URL(link).searchParams.get('t')!;
  const unsubscribe = (token: string) =>
    h.http().post('/api/v1/notifications/unsubscribe').send({ token });

  it('a published news item appears among the notices of people who were there', async () => {
    const before = await person();
    const item = await news();
    const after = await person('late');

    const mine = await list(before.token);
    expect(mine).toMatchObject({ total: 1, unread: 1 });
    expect(mine.items[0]).toMatchObject({
      kind: 'NEWS',
      type: 'contentNews',
      params: { titleHe: item.title },
      link: decodeURI(item.link),
      readAt: null,
    });
    // An account created afterwards doesn't start with a backlog.
    expect(await list(after.token)).toMatchObject({ total: 0, unread: 0 });
  });

  it('each kind of content is announced under its own kind', async () => {
    const p = await person();
    const e = await event();
    const lesson = await education();
    const guideline = (
      await h
        .http()
        .post('/api/v1/admin/guidelines')
        .set(as(admin))
        .send({
          sourceOrg: 'Example Urology Society (fictional)',
          officialUrl: 'https://guidelines.example.test/notices',
          translations: { en: { title: `Fictional guideline ${run}` } },
          version: { version: '2030', publishedOn: '2030-03-01' },
        })
        .expect(201)
    ).body as { id: string };
    await h
      .http()
      .post(`/api/v1/admin/guidelines/${guideline.id}/versions`)
      .set(as(admin))
      .send({ version: '2031', publishedOn: '2031-03-01' })
      .expect(201);

    const mine = (await list(p.token)).items.map(({ kind, type, link, params }) => ({
      kind,
      type,
      link,
      title: params.titleHe ?? params.titleEn,
    }));
    expect(mine).toEqual([
      {
        kind: 'GUIDELINES',
        type: 'contentGuidelineVersion',
        link: `/guidelines/${guideline.id}`,
        title: `Fictional guideline ${run}`,
      },
      {
        kind: 'GUIDELINES',
        type: 'contentGuideline',
        link: `/guidelines/${guideline.id}`,
        title: `Fictional guideline ${run}`,
      },
      {
        kind: 'EDUCATION',
        type: 'contentEducation',
        link: decodeURI(lesson.link),
        title: lesson.title,
      },
      { kind: 'NEW_EVENTS', type: 'contentEvent', link: decodeURI(e.link), title: e.title },
    ]);
  });

  it('only people who may read an item are told about it', async () => {
    const visitor = await person();
    const full = await member('FULL_MEMBER');
    const student = await member('STUDENT');
    const suspended = await member('FULL_MEMBER', 'suspend');
    const open = decodeURI((await news()).link);
    const members = decodeURI((await news({ accessTier: 'MEMBERS' })).link);
    const fullOnly = decodeURI(
      (await news({ accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] })).link,
    );

    expect(await links(visitor.token)).toEqual([open]);
    expect(await links(full.token)).toEqual([fullOnly, members, open]);
    expect(await links(student.token)).toEqual([members, open]);
    expect(await links(suspended.token)).toEqual([open]);
    expect(await unread(full.token)).toBe(3);
    expect(await unread(visitor.token)).toBe(1);
  });

  it('a kind that is switched off in the app is not listed', async () => {
    const p = await person();
    await setPreferences(p.token, [{ kind: 'NEWS', app: false, email: false }]).expect(200);
    await news();
    const e = await event();
    expect(await links(p.token)).toEqual([decodeURI(e.link)]);
    expect(await unread(p.token)).toBe(1);
  });

  it('marks announcements as read, one at a time or all at once', async () => {
    const p = await person();
    const other = await person('other');
    const first = await news();
    await news();
    const membersOnly = await news({ accessTier: 'MEMBERS' });
    expect(await unread(p.token)).toBe(2);

    const mine = await list(p.token);
    const target = mine.items.find((item) => item.link === decodeURI(first.link))!;
    await h.http().post(`/api/v1/notifications/${target.id}/read`).set(bearer(p.token)).expect(204);
    await h.http().post(`/api/v1/notifications/${target.id}/read`).set(bearer(p.token)).expect(204);
    expect(await unread(p.token)).toBe(1);
    expect(
      (await list(p.token)).items.find((item) => item.id === target.id)!.readAt,
    ).not.toBeNull();
    // Each person has their own read state.
    expect(await unread(other.token)).toBe(2);

    // An announcement the person may not see can't be marked, and looks like nothing.
    const { rows } = await h.db.query<{ id: string }>(
      `SELECT id FROM content_announcements WHERE entity_id = $1`,
      [membersOnly.id],
    );
    await h
      .http()
      .post(`/api/v1/notifications/${rows[0]!.id}/read`)
      .set(bearer(p.token))
      .expect(404);

    await h.http().post('/api/v1/notifications/read-all').set(bearer(p.token)).expect(204);
    expect(await list(p.token)).toMatchObject({ total: 2, unread: 0 });
    // What is published afterwards is unread again.
    await news();
    expect(await list(p.token)).toMatchObject({ total: 3, unread: 1 });
  });

  it('publishing an item again tells nobody twice', async () => {
    const p = await person();
    const lesson = await education();
    expect(await links(p.token)).toEqual([decodeURI(lesson.link)]);
    await educationStep(admin, lesson.id, 'TAKE_DOWN');
    await educationStep(editor, lesson.id, 'SUBMIT');
    await educationStep(admin, lesson.id, 'PUBLISH');
    expect(await list(p.token)).toMatchObject({ total: 1 });

    // The same item announced directly a second time is refused by the database rule.
    const item = {
      entityType: 'news',
      entityId: (await news()).id,
      kind: 'NEWS' as const,
      type: 'contentNews',
      translations: [{ locale: 'he', title: 'שוב' }],
      link: '/news/again',
      accessTier: 'PUBLIC' as const,
    };
    expect(await announcer.announce(item)).toBe(false);
    expect(await list(p.token)).toMatchObject({ total: 2 });
  });

  describe('the daily summary email', () => {
    it('lists what a person asked for and may read, once, and only when there is something', async () => {
      // Whatever earlier tests published is taken by this run.
      await announcer.sendDigest();
      const wantsNews = await person('wants-news');
      const wantsEvents = await person('wants-events');
      const wantsNothing = await person('wants-nothing');
      const memberWantsNews = await member('STUDENT');
      await setPreferences(wantsNews.token, [{ kind: 'NEWS', app: true, email: true }]).expect(200);
      await setPreferences(wantsEvents.token, [
        { kind: 'NEW_EVENTS', app: false, email: true },
      ]).expect(200);
      await setPreferences(memberWantsNews.token, [
        { kind: 'NEWS', app: true, email: true },
      ]).expect(200);

      const open = await news();
      const membersOnly = await news({ accessTier: 'MEMBERS' });
      const e = await event();
      // Publishing sends no email by itself.
      expect(h.mailer.count(wantsNews.email, 'contentDigest')).toBe(0);

      expect(await announcer.sendDigest()).toBeGreaterThanOrEqual(3);
      const titles = (email: string) =>
        h.mailer.last(email, 'contentDigest')?.list?.map((item) => item.title);
      expect(titles(wantsNews.email)).toEqual([open.title]);
      expect(titles(memberWantsNews.email)).toEqual([open.title, membersOnly.title]);
      expect(titles(wantsEvents.email)).toEqual([e.title]);
      expect(h.mailer.count(wantsNothing.email, 'contentDigest')).toBe(0);

      const mail = h.mailer.last(wantsNews.email, 'contentDigest')!;
      expect(mail.list![0]).toMatchObject({
        label: 'News',
        link: expect.stringContaining('/en/news/'),
      });
      expect(mail.unsubscribe!.link).toContain('/en/notifications/unsubscribe?t=');
      expect(mail.unsubscribe!.preferencesLink).toContain('/en/account/notifications/preferences');

      // A second run has nothing new: no email.
      await announcer.sendDigest();
      expect(h.mailer.count(wantsNews.email, 'contentDigest')).toBe(1);
    });

    it('its link switches off email for new content, without signing in', async () => {
      await announcer.sendDigest();
      const p = await person('unsubscriber');
      await setPreferences(p.token, [
        { kind: 'NEWS', app: true, email: true },
        { kind: 'EDUCATION', app: true, email: true },
      ]).expect(200);
      await news();
      await announcer.sendDigest();
      const token = tokenOf(h.mailer.last(p.email, 'contentDigest')!.unsubscribe!.link);

      const done = await unsubscribe(token).expect(200);
      expect(done.body.kinds).toEqual([
        'NEWS',
        'NEW_EVENTS',
        'EDUCATION',
        'GUIDELINES',
        'POSITIONS',
        'JOURNAL_CLUB',
      ]);
      const now = await preferences(p.token);
      expect(now.NEWS).toMatchObject({ app: true, email: false });
      expect(now.EDUCATION).toMatchObject({ app: true, email: false });
      // Other kinds are untouched.
      expect(now.MY_EVENTS).toMatchObject({ app: true, email: true });
      expect(now.ASSOCIATION).toMatchObject({ app: true, email: true });

      await news();
      await announcer.sendDigest();
      expect(h.mailer.count(p.email, 'contentDigest')).toBe(1);
    });
  });

  describe('the "stop these emails" link', () => {
    it('is on emails a switch controls, and switches off only its own kind', async () => {
      const p = await person('registrant');
      const e = await event();
      await h
        .http()
        .post(`/api/v1/events/${encodeURIComponent(e.link.split('/').pop()!)}/registration`)
        .set(bearer(p.token))
        .expect(200);
      const mail = h.mailer.last(p.email, 'eventRegistered')!;
      const done = await unsubscribe(tokenOf(mail.unsubscribe!.link)).expect(200);
      expect(done.body.kinds).toEqual(['MY_EVENTS']);
      const now = await preferences(p.token);
      expect(now.MY_EVENTS).toMatchObject({ app: true, email: false });
      expect(now.ASSOCIATION).toMatchObject({ app: true, email: true });
      // Using the link again changes nothing and still answers the same.
      await unsubscribe(tokenOf(mail.unsubscribe!.link)).expect(200);
    });

    it('is not on emails that are always sent', async () => {
      await news();
      const mail = h.mailer.last(editor.email, 'newsPublished')!;
      expect(mail).toBeDefined();
      expect(mail.unsubscribe).toBeUndefined();
    });

    it('refuses a link that was altered, is empty or is another kind of token', async () => {
      const altered = await unsubscribe('a.b.c').expect(400);
      expect(altered.body.error.details[0].code).toBe('unsubscribeLinkInvalid');
      await unsubscribe('').expect(400);
      // A sign-in token is not an unsubscribe link.
      await unsubscribe(editor.accessToken).expect(400);
    });
  });

  it('old notices and announcements are removed after 180 days', async () => {
    const p = await person();
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      p.email,
    ]);
    const old = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 179 * 24 * 60 * 60 * 1000);
    for (const at of [old, recent]) {
      await h.db.query(
        `INSERT INTO notifications (id, user_id, kind, type, created_at)
         VALUES (gen_random_uuid(), $1, 'ACCOUNT', 'test', $2)`,
        [rows[0]!.id, at],
      );
      await h.db.query(
        `INSERT INTO content_announcements
           (id, entity_type, entity_id, kind, type, title_he, link, access_tier, created_at, digested_at)
         VALUES (gen_random_uuid(), 'test', gen_random_uuid(), 'NEWS', 'contentNews', $1, '/news/old',
                 'PUBLIC', $2, $2)`,
        [`ישן ${run}`, at],
      );
    }
    const count = async (table: string, column: string, value: string) =>
      Number(
        (await h.db.query(`SELECT count(*) AS c FROM ${table} WHERE ${column} = $1`, [value]))
          .rows[0].c,
      );
    await announcer.cleanUp();
    expect(await count('notifications', 'user_id', rows[0]!.id)).toBe(1);
    expect(await count('content_announcements', 'title_he', `ישן ${run}`)).toBe(1);
  });
});
