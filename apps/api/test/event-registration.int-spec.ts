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

/** M5 checkpoint 3: registration with a waiting list, and the personal schedule. */
describe('event registration and schedule (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let types: Record<string, string>;
  const run = Date.now();
  const at = (hour: number, day = 10) => new Date(Date.UTC(2030, 0, day, hour)).toISOString();
  const as = () => bearer(admin.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  async function event(extra: Record<string, unknown> = {}, publish = true) {
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as())
      .send({
        startAt: at(7),
        endAt: at(16),
        locationName: 'Example Hall',
        registrationMode: 'INTERNAL',
        translations: { he: { title: `אירוע להרשמה ${run} ${++n}` } },
        ...extra,
      })
      .expect(201);
    if (publish) {
      await h.http().post(`/api/v1/admin/events/${created.body.id}/publish`).set(as()).expect(200);
    }
    return created.body as { id: string; slug: string };
  }
  async function person(label = 'attendee') {
    const email = await createVerifiedUser(h, label);
    return { email, token: (await signIn(h, email)).accessToken };
  }
  const path = (e: { slug: string }, tail: string) =>
    `/api/v1/events/${encodeURIComponent(e.slug)}/${tail}`;
  const register = (e: { slug: string }, token: string) =>
    h.http().post(path(e, 'registration')).set(bearer(token));
  const cancel = (e: { slug: string }, token: string) =>
    h.http().delete(path(e, 'registration')).set(bearer(token));
  const mine = (e: { slug: string }, token: string) =>
    h.http().get(path(e, 'registration')).set(bearer(token));
  const session = async (e: { id: string }, from: number, to: number) =>
    (
      await h
        .http()
        .post(`/api/v1/admin/events/${e.id}/sessions`)
        .set(as())
        .send({
          startAt: at(from),
          endAt: at(to),
          translations: { he: { title: `מושב ${run} ${++n}` } },
        })
        .expect(201)
    ).body.id as string;

  it('needs a signed-in account', async () => {
    const e = await event();
    await h.http().post(path(e, 'registration')).expect(401);
    await h.http().get(path(e, 'registration')).expect(401);
    await h.http().get('/api/v1/me/schedule').expect(401);
    await expectAdminOnly(h, 'get', `/api/v1/admin/events/${e.id}/registrations`);
  });

  it('registers, confirms by email, refuses a second time, and cancels', async () => {
    const e = await event();
    const p = await person();
    expect((await mine(e, p.token).expect(200)).body).toEqual({
      status: 'NONE',
      waitingPosition: null,
      sessionIds: [],
    });
    const done = await register(e, p.token).expect(200);
    expect(done.body).toMatchObject({ status: 'REGISTERED', waitingPosition: null });
    expect(h.mailer.last(p.email, 'eventRegistered')?.params).toMatchObject({
      link: expect.stringContaining('/events/'),
    });
    const again = await register(e, p.token).expect(409);
    expect(again.body.error.details[0].code).toBe('alreadyRegistered');

    expect((await cancel(e, p.token).expect(200)).body.status).toBe('NONE');
    const twice = await cancel(e, p.token).expect(422);
    expect(twice.body.error.details[0].code).toBe('notRegistered');
    // Registering again after cancelling is allowed.
    expect((await register(e, p.token).expect(200)).body.status).toBe('REGISTERED');
  });

  it('refuses in-app registration for other modes, drafts, cancelled and started events', async () => {
    const p = await person();
    const external = await event({
      registrationMode: 'EXTERNAL',
      registrationUrl: 'https://tickets.example.test/e',
    });
    const none = await event({ registrationMode: 'NONE' });
    for (const e of [external, none]) {
      const res = await register(e, p.token).expect(422);
      expect(res.body.error.details[0].code).toBe('registrationNotInApp');
    }
    const draft = await event({}, false);
    await register(draft, p.token).expect(404);

    const cancelled = await event();
    await h
      .http()
      .post(`/api/v1/admin/events/${cancelled.id}/cancel`)
      .set(as())
      .send({ reason: 'Test' })
      .expect(200);
    const closed = await register(cancelled, p.token).expect(422);
    expect(closed.body.error.details[0].code).toBe('registrationClosed');

    const started = await event({
      startAt: '2020-03-01T07:00:00.000Z',
      endAt: '2099-03-01T15:00:00.000Z',
    });
    const late = await register(started, p.token).expect(422);
    expect(late.body.error.details[0].code).toBe('registrationClosed');
  });

  it('respects the access tiers', async () => {
    const membersOnly = await event({ accessTier: 'MEMBERS' });
    const outsider = await person();
    await register(membersOnly, outsider.token).expect(404);

    const iuaAdmin = await signInAdmin(h, 'tier-admin');
    const email = await createVerifiedUser(h, 'student');
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(bearer(iuaAdmin.accessToken))
      .send({ email, typeId: types.STUDENT })
      .expect(201);
    const member = (await signIn(h, email)).accessToken;
    expect((await register(membersOnly, member).expect(200)).body.status).toBe('REGISTERED');
  });

  it('puts people on a waiting list when full, and promotes them in order', async () => {
    const e = await event({ capacity: 1 });
    const [first, second, third] = [await person(), await person(), await person()];
    expect((await register(e, first.token).expect(200)).body.status).toBe('REGISTERED');
    expect((await register(e, second.token).expect(200)).body).toMatchObject({
      status: 'WAITLISTED',
      waitingPosition: 1,
    });
    expect((await register(e, third.token).expect(200)).body).toMatchObject({
      status: 'WAITLISTED',
      waitingPosition: 2,
    });
    expect(h.mailer.last(second.email, 'eventWaitlisted')).toBeDefined();

    const page = await h.http().get(path(e, '').replace(/\/$/, '')).expect(200);
    expect(page.body).toMatchObject({ capacity: 1, placesLeft: 0, registrationOpen: true });

    // The registered person cancels: the first one waiting gets the place and an email.
    await cancel(e, first.token).expect(200);
    expect((await mine(e, second.token).expect(200)).body.status).toBe('REGISTERED');
    expect((await mine(e, third.token).expect(200)).body).toMatchObject({
      status: 'WAITLISTED',
      waitingPosition: 1,
    });
    expect(h.mailer.count(second.email, 'eventPromoted')).toBe(1);
    expect(h.mailer.count(third.email, 'eventPromoted')).toBe(0);

    // Someone waiting leaves the list: nobody is promoted.
    await cancel(e, third.token).expect(200);
    const list = await h
      .http()
      .get(`/api/v1/admin/events/${e.id}/registrations`)
      .set(as())
      .expect(200);
    expect(list.body).toMatchObject({ capacity: 1, registered: 1, waiting: 0, total: 3 });
    expect(
      list.body.items.map((i: { email: string; status: string }) => [i.email, i.status]),
    ).toEqual(
      expect.arrayContaining([
        [second.email, 'REGISTERED'],
        [first.email, 'CANCELLED'],
        [third.email, 'CANCELLED'],
      ]),
    );
    expect(list.body.items[0]).toMatchObject({ email: second.email, status: 'REGISTERED' });
  });

  it('never gives the last place to two people at once', async () => {
    const e = await event({ capacity: 1 });
    // Accounts are made one by one; only the registrations race.
    const people: Awaited<ReturnType<typeof person>>[] = [];
    for (let i = 0; i < 5; i++) people.push(await person());
    const results = await Promise.all(people.map((p) => register(e, p.token)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const statuses = results.map((r) => r.body.status as string);
    expect(statuses.filter((s) => s === 'REGISTERED')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'WAITLISTED')).toHaveLength(4);
    const positions: (number | null)[] = [];
    for (const p of people) positions.push((await mine(e, p.token)).body.waitingPosition);
    expect(positions.filter((p) => p !== null).sort()).toEqual([1, 2, 3, 4]);
  });

  it('gives places to the waiting list when the capacity grows', async () => {
    const e = await event({ capacity: 1 });
    const [first, second, third] = [await person(), await person(), await person()];
    await register(e, first.token).expect(200);
    await register(e, second.token).expect(200);
    await register(e, third.token).expect(200);
    const current = await h.http().get(`/api/v1/admin/events/${e.id}`).set(as()).expect(200);
    await h
      .http()
      .put(`/api/v1/admin/events/${e.id}`)
      .set(as())
      .set('If-Match', `"${current.body.version}"`)
      .send({
        startAt: at(7),
        endAt: at(16),
        registrationMode: 'INTERNAL',
        capacity: 2,
        translations: { he: { title: current.body.translations.he.title } },
      })
      .expect(200);
    expect((await mine(e, second.token)).body.status).toBe('REGISTERED');
    expect((await mine(e, third.token)).body.status).toBe('WAITLISTED');
    expect(h.mailer.count(second.email, 'eventPromoted')).toBe(1);
  });

  it('keeps a personal schedule for registered people, and flags overlaps', async () => {
    const e = await event();
    const other = await event();
    const [morning, clash, afternoon] = [
      await session(e, 8, 10),
      await session(e, 9, 11),
      await session(e, 13, 14),
    ];
    const foreign = await session(other, 8, 9);
    const p = await person();
    const put = (sessionIds: string[]) =>
      h.http().put(path(e, 'schedule')).set(bearer(p.token)).send({ sessionIds });

    const early = await put([morning]).expect(422);
    expect(early.body.error.details[0].code).toBe('scheduleNeedsRegistration');
    await register(e, p.token).expect(200);
    const wrong = await put([foreign]).expect(400);
    expect(wrong.body.error.details[0].code).toBe('unknownSession');

    const chosen = await put([afternoon, morning, clash]).expect(200);
    expect(chosen.body.sessionIds).toEqual([morning, clash, afternoon]);

    const schedule = await h
      .http()
      .get('/api/v1/me/schedule?locale=he')
      .set(bearer(p.token))
      .expect(200);
    expect(schedule.body.items).toHaveLength(1);
    expect(schedule.body.items[0]).toMatchObject({
      slug: e.slug,
      status: 'REGISTERED',
      cancelled: false,
      locationName: 'Example Hall',
    });
    expect(
      schedule.body.items[0].sessions.map((s: { id: string; overlaps: boolean }) => [
        s.id,
        s.overlaps,
      ]),
    ).toEqual([
      [morning, true],
      [clash, true],
      [afternoon, false],
    ]);

    // Replacing the choice, then cancelling the registration, empties the schedule.
    expect((await put([afternoon]).expect(200)).body.sessionIds).toEqual([afternoon]);
    await cancel(e, p.token).expect(200);
    const after = await h.http().get('/api/v1/me/schedule').set(bearer(p.token)).expect(200);
    expect(after.body.items).toEqual([]);
  });

  it('does not let people on the waiting list choose sessions', async () => {
    const e = await event({ capacity: 1 });
    const s = await session(e, 8, 9);
    const [first, second] = [await person(), await person()];
    await register(e, first.token).expect(200);
    await register(e, second.token).expect(200);
    const res = await h
      .http()
      .put(path(e, 'schedule'))
      .set(bearer(second.token))
      .send({ sessionIds: [s] })
      .expect(422);
    expect(res.body.error.details[0].code).toBe('scheduleNeedsRegistration');
  });
});
