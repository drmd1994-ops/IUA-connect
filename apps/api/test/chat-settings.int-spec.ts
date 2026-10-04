import { RealtimeBus } from '../src/infra/realtime/realtime-bus';
import { type ChatEvent, ChatStream } from '../src/modules/chat';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';
import { type ChatPerson as Person, NOBODY, chatActors } from './chat-harness';

/**
 * M11 checkpoint 3: who can be written to, blocking, and each person's chat settings.
 * Everyone here is fictional.
 */
describe('chat: blocking, settings and finding people (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  const {
    tag,
    person,
    member,
    listed,
    consent,
    endMembership,
    start,
    send,
    messages,
    conversation,
    list,
    unread,
    read,
    block,
    unblock,
    chatSettings,
    people,
    pair,
    bodies,
  } = chatActors(
    () => h,
    () => admin.accessToken,
  );
  const STARTING = { audience: 'LISTED', readReceipts: true, typing: true };

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'chat-settings-admin');
  });

  afterAll(async () => {
    await h.close();
  });

  const rename = (p: Person, lastName: string) =>
    h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(p.token))
      .send({ firstName: 'Dana', lastName })
      .expect(200);
  const found = async (as: Person, q: string) =>
    ((await people(as, q).expect(200)).body.items as { id: string }[]).map((item) => item.id);

  it('needs a signed-in account on every route', async () => {
    await h.http().get('/api/v1/chat/people?q=dana').expect(401);
    await h.http().get('/api/v1/chat/blocks').expect(401);
    await h.http().post('/api/v1/chat/blocks').send({ userId: NOBODY }).expect(401);
    await h.http().delete(`/api/v1/chat/blocks/${NOBODY}`).expect(401);
    await h.http().get('/api/v1/me/chat-settings').expect(401);
    await h.http().put('/api/v1/me/chat-settings').send(STARTING).expect(401);
  });

  describe('finding someone to write to', () => {
    it('finds listed members by name, and only for an active member', async () => {
      const name = tag();
      const viewer = await member();
      const target = await listed();
      await rename(target, `Fictional ${name}`);
      expect((await people(viewer, name).expect(200)).body.items).toEqual([
        {
          id: target.id,
          firstName: 'Dana',
          lastName: `Fictional ${name}`,
          title: null,
          photoFileId: null,
        },
      ]);
      // The searcher is never in their own results.
      expect(await found(target, name)).toEqual([]);
      await people(viewer, 'a').expect(400);
      await h.http().get('/api/v1/chat/people').set(bearer(viewer.token)).expect(400);

      const noMembership = await person();
      const refused = await people(noMembership, name).expect(403);
      expect(refused.body.error.details[0].code).toBe('membersOnly');
      await people({ token: admin.accessToken } as Person, name).expect(403);
    });

    it('not listed, not active, set to "nobody" and blocked all look like nobody', async () => {
      const name = tag();
      // Listed, so that someone can block them before any conversation.
      const viewer = await listed();
      const named = async (p: Person) => {
        await rename(p, `Fictional ${name}`);
        return p;
      };
      const reachable = await named(await listed());
      const notListed = await named(await member());
      const suspended = await named(await listed());
      await endMembership(suspended, 'suspend');
      const closed = await named(await listed());
      await chatSettings(closed, { ...STARTING, audience: 'NOBODY' }).expect(200);
      const blockedByViewer = await named(await listed());
      await block(viewer, blockedByViewer.id).expect(204);
      const blockedViewer = await named(await listed());
      await block(blockedViewer, viewer.id).expect(204);

      expect(await found(viewer, name)).toEqual([reachable.id]);
      const answers = [];
      for (const p of [notListed, suspended, closed, blockedByViewer, blockedViewer]) {
        const res = await start(viewer, p.id).expect(404);
        const { correlationId: _correlationId, ...error } = res.body.error;
        answers.push(JSON.stringify(error));
      }
      const invented = await start(viewer, NOBODY).expect(404);
      const { correlationId: _correlationId, ...error } = invented.body.error;
      expect(new Set([...answers, JSON.stringify(error)]).size).toBe(1);
    });

    it('leaving the directory or choosing "nobody" stops new conversations, not old ones', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'We already talk').expect(201);
      await consent(b, false);
      await chatSettings(b, { ...STARTING, audience: 'NOBODY' }).expect(200);
      await send(a, id, 'Still here').expect(201);
      await send(b, id, 'So am I').expect(201);
      // Opening it again finds the same conversation.
      expect((await start(a, b.id).expect(200)).body.id).toBe(id);
      // Someone new can't begin one.
      await start(await member(), b.id).expect(404);
      // B, not listed, can't be found, but can answer whoever wrote to them.
      expect((await conversation(b, id).expect(200)).body.other).toMatchObject({
        id: a.id,
        listed: false,
      });
    });
  });

  describe('blocking', () => {
    it('stops messages in both directions, and the blocked person is not told', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Before').expect(201);
      await block(b, a.id).expect(204);
      await block(b, a.id).expect(204);

      const refused = await send(a, id, 'After').expect(422);
      expect(refused.body.error.details).toEqual([{ code: 'chatUndeliverable' }]);
      // For A the conversation looks as it did; nothing names a block.
      const forA = (await conversation(a, id).expect(200)).body;
      expect(forA).toMatchObject({ sendState: 'none', blockedByMe: false });
      // B knows, because B did it, and can't send either until they unblock.
      const forB = (await conversation(b, id).expect(200)).body;
      expect(forB).toMatchObject({ sendState: 'blocked', blockedByMe: true });
      expect((await send(b, id, 'From B').expect(422)).body.error.details[0].code).toBe(
        'chatUndeliverable',
      );
      expect(bodies(await messages(b, id).expect(200))).toEqual(['Before']);
      expect(await unread(b)).toBe(1);

      const blocked = (await h.http().get('/api/v1/chat/blocks').set(bearer(b.token)).expect(200))
        .body.items;
      expect(blocked).toHaveLength(1);
      expect(blocked[0].user).toMatchObject({ id: a.id, firstName: 'Noa' });
      expect(
        (await h.http().get('/api/v1/chat/blocks').set(bearer(a.token)).expect(200)).body.items,
      ).toEqual([]);

      await unblock(b, a.id).expect(204);
      await unblock(b, a.id).expect(204);
      await send(a, id, 'After the unblock').expect(201);
      expect((await conversation(b, id).expect(200)).body).toMatchObject({
        sendState: 'none',
        blockedByMe: false,
      });

      const audit = await h.db.query<{ action: string }>(
        `SELECT action FROM audit_logs
         WHERE actor_user_id = $1 AND action LIKE 'chat.%' ORDER BY at`,
        [b.id],
      );
      expect(audit.rows.map((row) => row.action)).toEqual(['chat.block', 'chat.unblock']);
    });

    it('"is typing" from a blocked person goes nowhere', async () => {
      const { a, b, id } = await pair();
      await block(b, a.id).expect(204);
      const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
      const events: ChatEvent[] = [];
      const subscription = h.app
        .get(ChatStream)
        .open(b.id)
        .subscribe((event) => events.push(event));
      await bus.ready();
      try {
        await h
          .http()
          .post(`/api/v1/chat/conversations/${id}/typing`)
          .set(bearer(a.token))
          .expect(204);
        await new Promise((r) => setTimeout(r, 200));
        expect(events).toEqual([]);
      } finally {
        subscription.unsubscribe();
      }
    });

    it('only someone the person talks to, or could write to, can be blocked', async () => {
      const a = await member();
      const stranger = await member();
      const answers = [];
      for (const id of [stranger.id, NOBODY, a.id]) {
        const res = await block(a, id).expect(404);
        const { correlationId: _correlationId, ...error } = res.body.error;
        answers.push(JSON.stringify(error));
      }
      expect(new Set(answers).size).toBe(1);
      await block(a, 'not-an-id').expect(400);
      // A listed member can be blocked before any conversation, and then can't write.
      const target = await listed();
      await block(a, target.id).expect(204);
      await start(target, a.id).expect(404);
    });
  });

  describe('chat settings', () => {
    it('start as agreed, and are the person’s own', async () => {
      const a = await member();
      const get = () => h.http().get('/api/v1/me/chat-settings').set(bearer(a.token)).expect(200);
      expect((await get()).body).toEqual(STARTING);
      const changed = { audience: 'NOBODY', readReceipts: false, typing: false };
      expect((await chatSettings(a, changed).expect(200)).body).toEqual(changed);
      expect((await get()).body).toEqual(changed);
      await chatSettings(a, { audience: 'EVERYONE', readReceipts: true, typing: true }).expect(400);
      await chatSettings(a, { audience: 'LISTED' }).expect(400);
      await chatSettings(a, { ...STARTING, extra: 1 }).expect(400);
      const audit = await h.db.query<{ changes: object }>(
        `SELECT changes FROM audit_logs WHERE actor_user_id = $1 AND action = 'chat.settings.update'`,
        [a.id],
      );
      expect(audit.rows).toEqual([{ changes: changed }]);
    });

    it('with read status off on either side, neither sees "read"', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Did you read this?').expect(201);
      await send(b, id, 'And this?').expect(201);
      await read(a, id).expect(204);
      await read(b, id).expect(204);
      expect((await conversation(a, id).expect(200)).body.otherReadSeq).toBe(2);

      await chatSettings(b, { ...STARTING, readReceipts: false }).expect(200);
      for (const reader of [a, b]) {
        const view = (await conversation(reader, id).expect(200)).body;
        expect(view.otherReadSeq).toBeNull();
        // Delivered is still shown.
        expect(view.otherDeliveredSeq).toBe(2);
        expect((await list(reader).expect(200)).body.items[0].otherReadSeq).toBeNull();
      }
    });

    it('with typing switched off, nobody is told that the person is typing', async () => {
      const { a, b, id } = await pair();
      await chatSettings(a, { ...STARTING, typing: false }).expect(200);
      const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
      const events: ChatEvent[] = [];
      const subscription = h.app
        .get(ChatStream)
        .open(b.id)
        .subscribe((event) => events.push(event));
      await bus.ready();
      try {
        await h
          .http()
          .post(`/api/v1/chat/conversations/${id}/typing`)
          .set(bearer(a.token))
          .expect(204);
        await new Promise((r) => setTimeout(r, 200));
        expect(events).toEqual([]);
      } finally {
        subscription.unsubscribe();
      }
    });
  });
});

/** M11 plan §3: the limits per person, against the real counters. */
describe('chat: rate limits', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness({ rateLimits: true }); // fresh counters per test
  });

  afterEach(async () => {
    await h.close();
  });

  const token = async () => (await signIn(h, await createVerifiedUser(h, 'rl-chat'))).accessToken;
  const sendTo = (as: string) =>
    h
      .http()
      .post(`/api/v1/chat/conversations/${NOBODY}/messages`)
      .set(bearer(as))
      .send({ body: 'x' });

  it('stops one person after 30 messages a minute, and nobody else', async () => {
    const first = await token();
    const second = await token();
    // The conversation doesn't exist, so each request is refused, and still counted.
    for (let i = 0; i < 30; i++) await sendTo(first).expect(404);
    const limited = await sendTo(first).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await sendTo(second).expect(404);
  });

  it('stops one person after 10 new conversations an hour', async () => {
    const first = await token();
    const startWith = () =>
      h.http().post('/api/v1/chat/conversations').set(bearer(first)).send({ userId: NOBODY });
    for (let i = 0; i < 10; i++) await startWith().expect(403);
    await startWith().expect(429);
  });

  it('stops one person after 60 searches for people a minute', async () => {
    const first = await token();
    const search = () => h.http().get('/api/v1/chat/people?q=dana').set(bearer(first));
    for (let i = 0; i < 60; i++) await search().expect(403);
    await search().expect(429);
  });

  it('drops "is typing" signals that come more often than one in three seconds', async () => {
    const first = await token();
    const typing = () =>
      h.http().post(`/api/v1/chat/conversations/${NOBODY}/typing`).set(bearer(first));
    // The first one is looked at (and the conversation isn't there); the rest are dropped.
    await typing().expect(404);
    await typing().expect(204);
    await typing().expect(204);
  });
});
