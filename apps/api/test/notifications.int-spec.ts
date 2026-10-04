import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M7 checkpoint 1: notices in the app, and the switches a person sets per kind and channel.
 * Event registration is the action that causes the notices here.
 */
describe('notifications and preferences (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  const run = Date.now();
  const at = (hour: number) => new Date(Date.UTC(2031, 0, 10, hour)).toISOString();

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInWithMfa(h, 'notify-events', (email) => grantRole(h, email, 'EVENT_ADMIN'));
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  async function event() {
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(bearer(admin.accessToken))
      .send({
        startAt: at(7),
        endAt: at(16),
        locationName: 'Example Hall',
        registrationMode: 'INTERNAL',
        translations: { he: { title: `אירוע להתראות ${run} ${++n}` } },
      })
      .expect(201);
    await h
      .http()
      .post(`/api/v1/admin/events/${created.body.id}/publish`)
      .set(bearer(admin.accessToken))
      .expect(200);
    return created.body as { id: string; slug: string };
  }
  /**
   * A signed-in person. The events these tests publish are also announced to everyone as new
   * content (content-notices.int-spec.ts); `quiet` switches that kind off, so the lists here
   * hold the person's own notices only.
   */
  async function person(label = 'notified', quiet = true) {
    const email = await createVerifiedUser(h, label);
    const token = (await signIn(h, email)).accessToken;
    if (quiet) {
      await h
        .http()
        .put('/api/v1/me/notification-preferences')
        .set(bearer(token))
        .send({ items: [{ kind: 'NEW_EVENTS', app: false, email: false }] })
        .expect(200);
    }
    return { email, token };
  }
  const register = (e: { slug: string }, token: string) =>
    h
      .http()
      .post(`/api/v1/events/${encodeURIComponent(e.slug)}/registration`)
      .set(bearer(token))
      .expect(200);
  const list = async (token: string, query = '') =>
    (await h.http().get(`/api/v1/notifications${query}`).set(bearer(token)).expect(200)).body as {
      items: {
        id: string;
        kind: string;
        type: string;
        params: Record<string, string>;
        link: string | null;
        readAt: string | null;
      }[];
      total: number;
      unread: number;
    };
  const unread = async (token: string) =>
    (await h.http().get('/api/v1/notifications/unread-count').set(bearer(token)).expect(200)).body
      .unread as number;
  const preferences = async (token: string) =>
    (await h.http().get('/api/v1/me/notification-preferences').set(bearer(token)).expect(200)).body
      .items as { kind: string; app: boolean; email: boolean; locked: boolean }[];
  const setPreferences = (token: string, items: object[]) =>
    h.http().put('/api/v1/me/notification-preferences').set(bearer(token)).send({ items });

  it('needs a signed-in account', async () => {
    await h.http().get('/api/v1/notifications').expect(401);
    await h.http().get('/api/v1/notifications/unread-count').expect(401);
    await h.http().post('/api/v1/notifications/read-all').expect(401);
    await h.http().get('/api/v1/me/notification-preferences').expect(401);
    await h.http().put('/api/v1/me/notification-preferences').send({ items: [] }).expect(401);
  });

  it('starts with the agreed settings', async () => {
    const p = await person('fresh', false);
    expect(await preferences(p.token)).toEqual([
      { kind: 'ACCOUNT', app: true, email: true, locked: true },
      { kind: 'MY_EVENTS', app: true, email: true, locked: false },
      { kind: 'ASSOCIATION', app: true, email: true, locked: false },
      { kind: 'MESSAGES', app: true, email: true, locked: false },
      { kind: 'NEWS', app: true, email: false, locked: false },
      { kind: 'NEW_EVENTS', app: true, email: false, locked: false },
      { kind: 'EDUCATION', app: true, email: false, locked: false },
      { kind: 'GUIDELINES', app: true, email: false, locked: false },
    ]);
    expect(await list(p.token)).toMatchObject({ items: [], total: 0, unread: 0 });
  });

  it('an action that emails the person also leaves a notice in the app', async () => {
    const e = await event();
    const p = await person();
    await register(e, p.token);
    expect(h.mailer.count(p.email, 'eventRegistered')).toBe(1);
    const mine = await list(p.token);
    expect(mine).toMatchObject({ total: 1, unread: 1 });
    expect(mine.items[0]).toMatchObject({
      kind: 'MY_EVENTS',
      type: 'eventRegistered',
      // The path only: no host and no language, and the link isn't repeated in the values.
      link: `/events/${e.slug}`,
      readAt: null,
    });
    expect(mine.items[0]!.params.title).toContain('אירוע להתראות');
    expect(mine.items[0]!.params).not.toHaveProperty('link');
    expect(await unread(p.token)).toBe(1);
  });

  it('marks one notice or all of them as read, and only the person’s own', async () => {
    const p = await person();
    const other = await person('other');
    await register(await event(), p.token);
    await register(await event(), p.token);
    await register(await event(), other.token);
    const [first] = (await list(p.token)).items;
    const [theirs] = (await list(other.token)).items;

    await h
      .http()
      .post(`/api/v1/notifications/${theirs!.id}/read`)
      .set(bearer(p.token))
      .expect(404);
    await h.http().post(`/api/v1/notifications/${first!.id}/read`).set(bearer(p.token)).expect(204);
    // Reading it again changes nothing.
    await h.http().post(`/api/v1/notifications/${first!.id}/read`).set(bearer(p.token)).expect(204);
    expect(await unread(p.token)).toBe(1);

    await h.http().post('/api/v1/notifications/read-all').set(bearer(p.token)).expect(204);
    expect(await unread(p.token)).toBe(0);
    expect((await list(p.token)).items.every((item) => item.readAt !== null)).toBe(true);
    // The other person's notice is untouched.
    expect(await unread(other.token)).toBe(1);
  });

  it('pages the list, newest first', async () => {
    const p = await person();
    const events = [await event(), await event(), await event()];
    for (const e of events) await register(e, p.token);
    const page = await list(p.token, '?pageSize=2');
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.link)).toEqual([
      `/events/${events[2]!.slug}`,
      `/events/${events[1]!.slug}`,
    ]);
    const rest = await list(p.token, '?pageSize=2&page=2');
    expect(rest.items.map((item) => item.link)).toEqual([`/events/${events[0]!.slug}`]);
  });

  it('a switched-off channel is not used; the other one still is', async () => {
    const noEmail = await person('no-email');
    const noApp = await person('no-app');
    const neither = await person('neither');
    await setPreferences(noEmail.token, [{ kind: 'MY_EVENTS', app: true, email: false }]).expect(
      200,
    );
    await setPreferences(noApp.token, [{ kind: 'MY_EVENTS', app: false, email: true }]).expect(200);
    await setPreferences(neither.token, [{ kind: 'MY_EVENTS', app: false, email: false }]).expect(
      200,
    );
    const e = await event();
    for (const p of [noEmail, noApp, neither]) await register(e, p.token);

    expect(h.mailer.count(noEmail.email, 'eventRegistered')).toBe(0);
    expect((await list(noEmail.token)).total).toBe(1);
    expect(h.mailer.count(noApp.email, 'eventRegistered')).toBe(1);
    expect((await list(noApp.token)).total).toBe(0);
    expect(h.mailer.count(neither.email, 'eventRegistered')).toBe(0);
    expect((await list(neither.token)).total).toBe(0);

    // Switching it back on works for the next notice.
    await setPreferences(neither.token, [{ kind: 'MY_EVENTS', app: true, email: true }]).expect(
      200,
    );
    await register(await event(), neither.token);
    expect(h.mailer.count(neither.email, 'eventRegistered')).toBe(1);
    expect((await list(neither.token)).total).toBe(1);
  });

  it('stores only the kinds that were sent, and keeps the others', async () => {
    const p = await person();
    const saved = await setPreferences(p.token, [
      { kind: 'NEWS', app: false, email: true },
      { kind: 'ASSOCIATION', app: true, email: false },
    ]).expect(200);
    expect(saved.body.items).toEqual(await preferences(p.token));
    const now = Object.fromEntries((await preferences(p.token)).map((item) => [item.kind, item]));
    expect(now.NEWS).toMatchObject({ app: false, email: true });
    expect(now.ASSOCIATION).toMatchObject({ app: true, email: false });
    expect(now.MY_EVENTS).toMatchObject({ app: true, email: true });
    expect(now.EDUCATION).toMatchObject({ app: true, email: false });
  });

  it('never lets "account and membership" be switched off, and refuses unknown kinds', async () => {
    const p = await person();
    const refused = await setPreferences(p.token, [
      { kind: 'ACCOUNT', app: true, email: false },
    ]).expect(400);
    expect(refused.body.error.details[0].code).toBe('notificationAlwaysOn');
    // Sending it as it is (on, on) is accepted and changes nothing.
    await setPreferences(p.token, [{ kind: 'ACCOUNT', app: true, email: true }]).expect(200);
    // Staff work notices have no switch; neither does a made-up kind.
    await setPreferences(p.token, [{ kind: 'WORK', app: false, email: false }]).expect(400);
    await setPreferences(p.token, [{ kind: 'NOPE', app: true, email: true }]).expect(400);
    await setPreferences(p.token, [{ kind: 'NEWS', app: 'yes', email: true }]).expect(400);
    expect((await preferences(p.token))[0]).toEqual({
      kind: 'ACCOUNT',
      app: true,
      email: true,
      locked: true,
    });
  });

  it('refuses a notice whose link leaves the site (database rule)', async () => {
    const p = await person();
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      p.email,
    ]);
    const insert = (link: string) =>
      h.db.query(
        `INSERT INTO notifications (id, user_id, kind, type, link)
         VALUES (gen_random_uuid(), $1, 'ACCOUNT', 'test', $2)`,
        [rows[0]!.id, link],
      );
    await expect(insert('https://elsewhere.example.test/x')).rejects.toThrow(
      /notifications_link_is_path/,
    );
    await expect(insert('//elsewhere.example.test/x')).rejects.toThrow(
      /notifications_link_is_path/,
    );
  });
});
