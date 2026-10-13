import { RealtimeBus } from '../src/infra/realtime/realtime-bus';
import { type ChatEvent, ChatStream } from '../src/modules/chat';
import { type Harness, bearer, signInAdmin, startHarness } from './auth-harness';
import { type ChatPerson as Person, NOBODY, chatActors } from './chat-harness';

/**
 * M11 checkpoint 2: private conversations and their messages. Everyone here is fictional.
 * The exit criterion is in "someone outside a conversation": nobody but its two people can
 * read a conversation or learn that it exists, whatever id they put in a request.
 */
describe('chat: conversations and messages (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  const {
    tag,
    person,
    member,
    listed,
    endMembership,
    unverify,
    start,
    send,
    messages,
    conversation,
    list,
    unread,
    read,
    settings,
    pair,
    bodies,
  } = chatActors(
    () => h,
    () => admin.accessToken,
  );

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'chat-admin');
  });

  afterAll(async () => {
    await h.close();
  });

  describe('who may use chat', () => {
    it('needs a signed-in account on every route', async () => {
      const id = NOBODY;
      await h.http().get('/api/v1/chat/conversations').expect(401);
      await h.http().post('/api/v1/chat/conversations').send({ userId: id }).expect(401);
      await h.http().get('/api/v1/chat/unread-count').expect(401);
      await h.http().get('/api/v1/chat/stream').expect(401);
      await h.http().get(`/api/v1/chat/conversations/${id}`).expect(401);
      await h.http().patch(`/api/v1/chat/conversations/${id}/me`).send({ mute: 'off' }).expect(401);
      await h.http().post(`/api/v1/chat/conversations/${id}/read`).send({}).expect(401);
      await h.http().post(`/api/v1/chat/conversations/${id}/typing`).expect(401);
      await h.http().get(`/api/v1/chat/conversations/${id}/messages`).expect(401);
      await h
        .http()
        .post(`/api/v1/chat/conversations/${id}/messages`)
        .send({ body: 'x' })
        .expect(401);
      await h.http().patch(`/api/v1/chat/messages/${id}`).send({ body: 'x' }).expect(401);
      await h.http().delete(`/api/v1/chat/messages/${id}`).expect(401);
      await h.http().post(`/api/v1/chat/messages/${id}/hide`).expect(401);
    });

    it('starting a conversation needs an account verified as a physician’s', async () => {
      const target = await listed();
      const neverVerified = await person();
      const unverified = await member();
      await unverify(unverified);
      for (const writer of [neverVerified, unverified]) {
        const refused = await start(writer, target.id).expect(403);
        expect(refused.body.error.details[0].code).toBe('membersOnly');
        // The same refusal for an id that never existed.
        await start(writer, NOBODY).expect(403);
        // Their own list still opens, and is empty.
        expect((await list(writer).expect(200)).body).toEqual({ items: [], nextCursor: null });
      }
      // An administrator who is not verified has no chat.
      await start({ token: admin.accessToken } as Person, target.id).expect(403);
    });

    it('a membership that ends leaves the person their chat: they keep the platform', async () => {
      const target = await listed();
      const suspended = await member();
      await endMembership(suspended, 'suspend');
      const expired = await member();
      await endMembership(expired, 'expire');
      for (const writer of [suspended, expired]) {
        const id = (await start(writer, target.id).expect(201)).body.id as string;
        await send(writer, id, 'Still here').expect(201);
        expect((await conversation(writer, id).expect(200)).body.sendState).toBe('none');
      }
    });

    it('someone who is no longer verified can read what they have, and can’t send', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Before it ended').expect(201);
      await unverify(a);
      expect(bodies(await messages(a, id).expect(200))).toEqual(['Before it ended']);
      expect((await conversation(a, id).expect(200)).body.sendState).toBe('membersOnly');
      const refused = await send(a, id, 'After').expect(403);
      expect(refused.body.error.details[0].code).toBe('membersOnly');
      // The other person can still answer; it will be there when they are verified again.
      await send(b, id, 'An answer').expect(201);
    });
  });

  describe('starting a conversation', () => {
    it('opens one conversation per pair, whoever starts it', async () => {
      const a = await listed();
      const b = await listed();
      const first = await start(a, b.id).expect(201);
      expect(first.body).toMatchObject({
        kind: 'DIRECT',
        other: { id: b.id, firstName: 'Dana', listed: true },
        lastMessage: null,
        lastSeq: 0,
        unreadCount: 0,
        sendState: 'none',
        blockedByMe: false,
      });
      const again = await start(a, b.id).expect(200);
      expect(again.body.id).toBe(first.body.id);
      const fromOther = await start(b, a.id).expect(200);
      expect(fromOther.body.id).toBe(first.body.id);
      expect(fromOther.body.other.id).toBe(a.id);
      const { rows } = await h.db.query(
        `SELECT 1 FROM conversations WHERE user_low_id IN ($1, $2) AND user_high_id IN ($1, $2)`,
        [a.id, b.id],
      );
      expect(rows).toHaveLength(1);
    });

    it('both starting at the same moment still gives one conversation', async () => {
      const a = await listed();
      const b = await listed();
      const [one, two] = await Promise.all([start(a, b.id), start(b, a.id)]);
      expect([one.status, two.status].sort()).toEqual([200, 201]);
      expect(one.body.id).toBe(two.body.id);
    });

    it('only with someone who is listed; everyone else looks like nobody', async () => {
      const a = await member();
      const notListed = await member();
      const unverified = await listed();
      await unverify(unverified);
      const answers = [];
      for (const id of [notListed.id, unverified.id, NOBODY, a.id]) {
        const res = await start(a, id).expect(404);
        const { correlationId: _correlationId, ...error } = res.body.error;
        answers.push(JSON.stringify(error));
      }
      expect(new Set(answers).size).toBe(1);
      await start(a, 'not-an-id').expect(400);
    });

    it('the writer needs a name, because the other person sees it', async () => {
      const nameless = await person('HONORARY_MEMBER');
      const target = await listed();
      const refused = await start(nameless, target.id).expect(422);
      expect(refused.body.error.details[0].code).toBe('chatNameRequired');
    });

    it('a conversation without a message is in nobody’s list', async () => {
      const { a, b, id } = await pair();
      expect((await list(a).expect(200)).body.items).toEqual([]);
      expect((await list(b).expect(200)).body.items).toEqual([]);
      await send(a, id, 'Hello').expect(201);
      expect((await list(a).expect(200)).body.items.map((c: { id: string }) => c.id)).toEqual([id]);
      expect((await list(b).expect(200)).body.items.map((c: { id: string }) => c.id)).toEqual([id]);
    });
  });

  describe('someone outside a conversation (exit criterion)', () => {
    it('gets "not found" on every route, exactly as for an id that never existed', async () => {
      const { a, b, id } = await pair();
      const sent = (await send(a, id, 'Between the two of us').expect(201)).body;
      const c = await listed();
      // C is a full member with a conversation of their own, and knows both ids.
      const own = (await start(c, b.id).expect(201)).body.id as string;
      await send(c, own, 'Mine').expect(201);

      const calls: [
        string,
        (target: string, message: string) => Promise<{ status: number; body: { error?: object } }>,
      ][] = [
        ['get', (t) => conversation(c, t)],
        ['messages', (t) => messages(c, t)],
        ['messages after', (t) => messages(c, t, '?after=0')],
        ['send', (t) => send(c, t, 'Let me in')],
        ['read', (t) => read(c, t)],
        [
          'typing',
          (t) => h.http().post(`/api/v1/chat/conversations/${t}/typing`).set(bearer(c.token)),
        ],
        ['settings', (t) => settings(c, t, { archived: true })],
        [
          'edit',
          (_t, m) =>
            h
              .http()
              .patch(`/api/v1/chat/messages/${m}`)
              .set(bearer(c.token))
              .send({ body: 'Changed' }),
        ],
        ['delete', (_t, m) => h.http().delete(`/api/v1/chat/messages/${m}`).set(bearer(c.token))],
        ['hide', (_t, m) => h.http().post(`/api/v1/chat/messages/${m}/hide`).set(bearer(c.token))],
      ];
      for (const [name, call] of calls) {
        const real = await call(id, sent.id);
        const invented = await call(NOBODY, NOBODY);
        expect([name, real.status]).toEqual([name, 404]);
        expect([name, invented.status]).toEqual([name, 404]);
        const strip = (body: { error?: object }) => {
          const { correlationId: _correlationId, ...error } = body.error as {
            correlationId: string;
          };
          return error;
        };
        expect(strip(real.body)).toEqual(strip(invented.body));
      }

      // A reply can't quote a message from a conversation that isn't the writer's.
      const refused = await send(c, own, 'Quoting', { replyToId: sent.id }).expect(400);
      expect(refused.body.error.details[0].code).toBe('chatReplyNotInConversation');
      // Nothing of it reached C's list, and nothing changed for the two.
      expect((await list(c).expect(200)).body.items.map((x: { id: string }) => x.id)).toEqual([
        own,
      ]);
      expect(bodies(await messages(b, id).expect(200))).toEqual(['Between the two of us']);
      const { rows } = await h.db.query(
        'SELECT body, deleted_at FROM messages WHERE conversation_id = $1',
        [id],
      );
      expect(rows).toEqual([{ body: 'Between the two of us', deleted_at: null }]);
    });

    it('an administrator has no way in either', async () => {
      const { a, id } = await pair();
      const sent = (await send(a, id, 'Private').expect(201)).body;
      const staff = { token: admin.accessToken } as Person;
      await conversation(staff, id).expect(404);
      await messages(staff, id).expect(404);
      await h
        .http()
        .delete(`/api/v1/chat/messages/${sent.id}`)
        .set(bearer(staff.token))
        .expect(404);
    });
  });

  describe('messages', () => {
    it('are sent, read back in order, and counted as unread for the other person', async () => {
      const { a, b, id } = await pair();
      const first = (await send(a, id, '  שלום, מה שלומך?  ').expect(201)).body;
      expect(first).toMatchObject({
        conversationId: id,
        seq: 1,
        senderId: a.id,
        mine: true,
        body: 'שלום, מה שלומך?',
        deleted: false,
        editedAt: null,
        canEdit: true,
        replyTo: null,
      });
      await send(a, id, 'Second').expect(201);
      expect(await unread(b)).toBe(1);
      expect(await unread(a)).toBe(0);

      const forB = (await list(b).expect(200)).body.items[0];
      expect(forB).toMatchObject({
        id,
        other: { id: a.id, firstName: 'Noa', listed: false, photoFileId: null },
        lastMessage: { seq: 2, senderId: a.id, body: 'Second', deleted: false },
        lastSeq: 2,
        unreadCount: 2,
        myLastReadSeq: 0,
      });
      const page = (await messages(b, id).expect(200)).body;
      expect(page.hasMore).toBe(false);
      expect(page.items.map((m: { seq: number; mine: boolean }) => [m.seq, m.mine])).toEqual([
        [1, false],
        [2, false],
      ]);

      const reply = (await send(b, id, 'מצוין, תודה', { replyToId: first.id }).expect(201)).body;
      expect(reply.replyTo).toEqual({
        id: first.id,
        seq: 1,
        senderId: a.id,
        body: 'שלום, מה שלומך?',
        deleted: false,
      });
      // Answering reads what came before.
      expect(await unread(b)).toBe(0);
      expect(await unread(a)).toBe(1);
    });

    it('refuses empty, too long and malformed input, and stores text as plain text', async () => {
      const { a, b, id } = await pair();
      await send(a, id, '').expect(400);
      await send(a, id, '   \n  ').expect(400);
      await send(a, id, 'x'.repeat(4001)).expect(400);
      await send(a, id, 'nul \u0000 inside').expect(400);
      await send(a, id, 'ok', { replyToId: 'nope' }).expect(400);
      await send(a, id, 'ok', { replyToId: NOBODY }).expect(400);
      await send(a, id, 'ok', { html: true }).expect(400);
      await h
        .http()
        .post(`/api/v1/chat/conversations/${id}/messages`)
        .set(bearer(a.token))
        .send({ body: ['an', 'array'] })
        .expect(400);
      await messages(a, id, '?before=5&after=1').expect(400);
      await messages(a, id, '?limit=500').expect(400);
      await h.http().get('/api/v1/chat/conversations/not-an-id').set(bearer(a.token)).expect(400);

      await send(a, id, 'x'.repeat(4000)).expect(201);
      const script = '<script>alert(1)</script> <img src=x onerror=alert(1)> &amp; "quotes"';
      await send(a, id, script).expect(201);
      const got = (await messages(b, id).expect(200)).body.items.at(-1);
      expect(got.body).toBe(script);
    });

    it('a repeated request with the same Idempotency-Key sends once', async () => {
      const { a, b, id } = await pair();
      const key = `key-${tag()}`;
      const once = await send(a, id, 'Only once').set('Idempotency-Key', key).expect(201);
      const twice = await send(a, id, 'Only once').set('Idempotency-Key', key).expect(200);
      expect(twice.body.id).toBe(once.body.id);
      const racing = `key-${tag()}`;
      const results = await Promise.all(
        [1, 2, 3].map(() => send(a, id, 'Racing').set('Idempotency-Key', racing)),
      );
      expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
      expect(bodies(await messages(b, id).expect(200))).toEqual(['Only once', 'Racing']);
      await send(a, id, 'Bad key').set('Idempotency-Key', 'has a space').expect(400);
    });

    it('numbers messages in order when both people send at once', async () => {
      const { a, b, id } = await pair();
      await Promise.all(
        Array.from({ length: 12 }, (_, i) => send(i % 2 ? a : b, id, `m${i}`).expect(201)),
      );
      const page = (await messages(a, id).expect(200)).body.items as { seq: number }[];
      expect(page.map((m) => m.seq)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      expect((await conversation(a, id).expect(200)).body.lastSeq).toBe(12);
    });
  });

  describe('editing and deleting', () => {
    it('only the sender edits, within 15 minutes, and the message is marked edited', async () => {
      const { a, b, id } = await pair();
      const sent = (await send(a, id, 'Frist').expect(201)).body;
      const edit = (as: Person, body: string) =>
        h.http().patch(`/api/v1/chat/messages/${sent.id}`).set(bearer(as.token)).send({ body });
      await edit(b, 'Hijacked').expect(403);
      await edit(a, '').expect(400);
      const edited = (await edit(a, 'First').expect(200)).body;
      expect(edited.body).toBe('First');
      expect(edited.editedAt).not.toBeNull();
      expect(bodies(await messages(b, id).expect(200))).toEqual(['First']);

      await h.db.query(
        `UPDATE messages SET created_at = now() - interval '16 minutes' WHERE id = $1`,
        [sent.id],
      );
      const late = await edit(a, 'Too late').expect(422);
      expect(late.body.error.details[0].code).toBe('chatEditWindowClosed');
      expect((await messages(a, id).expect(200)).body.items[0].canEdit).toBe(false);
    });

    it('delete for everyone erases the text and leaves the place', async () => {
      const { a, b, id } = await pair();
      const sent = (await send(a, id, 'A mistake').expect(201)).body;
      const reply = (await send(b, id, 'What?', { replyToId: sent.id }).expect(201)).body;
      const remove = (as: Person, messageId: string) =>
        h.http().delete(`/api/v1/chat/messages/${messageId}`).set(bearer(as.token));
      await remove(b, sent.id).expect(403);
      await remove(a, sent.id).expect(204);
      await remove(a, sent.id).expect(204);

      const page = (await messages(b, id).expect(200)).body.items;
      expect(page[0]).toMatchObject({ id: sent.id, body: '', deleted: true, canEdit: false });
      expect(page[1]).toMatchObject({
        id: reply.id,
        replyTo: { id: sent.id, body: '', deleted: true },
      });
      const { rows } = await h.db.query('SELECT body FROM messages WHERE id = $1', [sent.id]);
      expect(rows[0].body).toBe('');
      // A deleted message can't be edited back, and no longer counts as unread.
      await h
        .http()
        .patch(`/api/v1/chat/messages/${sent.id}`)
        .set(bearer(a.token))
        .send({ body: 'Back' })
        .expect(422);
      await send(a, id, 'Sorry').expect(201);
      await remove(a, (await messages(a, id).expect(200)).body.items.at(-1).id).expect(204);
      expect((await list(b).expect(200)).body.items[0].unreadCount).toBe(0);
    });

    it('delete for me hides a message on one side only', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Stays').expect(201);
      const sent = (await send(a, id, 'Hidden for B').expect(201)).body;
      const hide = (as: Person) =>
        h.http().post(`/api/v1/chat/messages/${sent.id}/hide`).set(bearer(as.token));
      await hide(b).expect(204);
      await hide(b).expect(204);
      expect(bodies(await messages(b, id).expect(200))).toEqual(['Stays']);
      expect(bodies(await messages(a, id).expect(200))).toEqual(['Stays', 'Hidden for B']);
      const forB = (await list(b).expect(200)).body.items[0];
      expect(forB.lastMessage.body).toBe('Stays');
      expect(forB.unreadCount).toBe(1);
      expect((await list(a).expect(200)).body.items[0].lastMessage.body).toBe('Hidden for B');
    });
  });

  describe('read, delivered and unread', () => {
    it('moves two markers per person, and shows the other person’s', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'One').expect(201);
      await send(a, id, 'Two').expect(201);
      expect((await conversation(a, id).expect(200)).body).toMatchObject({
        otherDeliveredSeq: 0,
        otherReadSeq: 0,
      });
      // B's app receives the list: delivered, not read.
      await list(b).expect(200);
      expect((await conversation(a, id).expect(200)).body).toMatchObject({
        otherDeliveredSeq: 2,
        otherReadSeq: 0,
      });
      await read(b, id, { seq: 1 }).expect(204);
      expect((await conversation(a, id).expect(200)).body.otherReadSeq).toBe(1);
      expect((await conversation(b, id).expect(200)).body.unreadCount).toBe(1);
      await read(b, id).expect(204);
      await read(b, id, { seq: 1 }).expect(204); // never moves back
      await read(b, id, { seq: 99 }).expect(204); // never past the end
      expect((await conversation(a, id).expect(200)).body.otherReadSeq).toBe(2);
      expect((await conversation(b, id).expect(200)).body).toMatchObject({
        unreadCount: 0,
        myLastReadSeq: 2,
      });
      const { rows } = await h.db.query(
        'SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id = $1',
        [id],
      );
      // Two rows for the whole conversation, however many messages it holds.
      expect(rows[0].n).toBe(2);
    });

    it('"mark as unread" shows until the conversation is opened again', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Read me later').expect(201);
      await read(b, id).expect(204);
      expect(await unread(b)).toBe(0);
      expect((await settings(b, id, { markedUnread: true }).expect(200)).body.markedUnread).toBe(
        true,
      );
      expect(await unread(b)).toBe(1);
      // The sender is not told that it was marked.
      expect((await conversation(a, id).expect(200)).body.otherReadSeq).toBe(1);
      await read(b, id).expect(204);
      expect(await unread(b)).toBe(0);
      await settings(b, id, { markedUnread: false }).expect(400);
      await settings(b, id, {}).expect(400);
    });

    it('a muted or archived conversation is left out of the number on the Chat link', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Ping').expect(201);
      expect(await unread(b)).toBe(1);
      const muted = (await settings(b, id, { mute: '8h' }).expect(200)).body;
      expect(muted.muted).toBe(true);
      expect(new Date(muted.mutedUntil).getTime()).toBeGreaterThan(Date.now() + 7 * 3600 * 1000);
      expect(await unread(b)).toBe(0);
      expect((await settings(b, id, { mute: 'forever' }).expect(200)).body).toMatchObject({
        muted: true,
        mutedUntil: null,
      });
      // A mute whose time has passed is over.
      await h.db.query(
        `UPDATE conversation_members SET muted = true, muted_until = now() - interval '1 minute'
         WHERE conversation_id = $1 AND user_id = $2`,
        [id, b.id],
      );
      expect((await conversation(b, id).expect(200)).body.muted).toBe(false);
      expect(await unread(b)).toBe(1);
      await settings(b, id, { mute: 'off' }).expect(200);

      await settings(b, id, { archived: true }).expect(200);
      expect(await unread(b)).toBe(0);
      expect((await list(b).expect(200)).body.items).toEqual([]);
      expect(
        (await list(b, '?archived=true').expect(200)).body.items.map((c: { id: string }) => c.id),
      ).toEqual([id]);
    });

    it('a new message brings an archived conversation back, unless it is muted', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'One').expect(201);
      await settings(b, id, { archived: true }).expect(200);
      await send(a, id, 'Two').expect(201);
      expect((await conversation(b, id).expect(200)).body.archived).toBe(false);

      await settings(b, id, { archived: true, mute: 'forever' }).expect(200);
      await send(a, id, 'Three').expect(201);
      expect((await conversation(b, id).expect(200)).body.archived).toBe(true);
      // Writing in an archived conversation takes the writer's own out of the archive.
      await send(b, id, 'Four').expect(201);
      expect((await conversation(b, id).expect(200)).body.archived).toBe(false);
    });
  });

  describe('the list and paging', () => {
    it('lists newest activity first, pages by cursor, and filters by name', async () => {
      const a = await member();
      const names = ['Avigail', 'Boaz', 'Carmel'];
      const ids: string[] = [];
      for (const name of names) {
        const other = await listed(name);
        const id = (await start(a, other.id).expect(201)).body.id as string;
        await send(a, id, `To ${name}`).expect(201);
        ids.push(id);
      }
      const all = (await list(a).expect(200)).body;
      expect(all.items.map((c: { id: string }) => c.id)).toEqual([...ids].reverse());
      expect(all.nextCursor).toBeNull();

      const first = (await list(a, '?limit=2').expect(200)).body;
      expect(first.items.map((c: { id: string }) => c.id)).toEqual([ids[2], ids[1]]);
      expect(first.nextCursor).not.toBeNull();
      const second = (
        await list(a, `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`).expect(200)
      ).body;
      expect(second.items.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
      expect(second.nextCursor).toBeNull();
      await list(a, '?cursor=nonsense').expect(400);
      await list(a, '?limit=500').expect(400);

      // A new message moves its conversation to the top.
      await send(a, ids[0]!, 'Again').expect(201);
      expect((await list(a).expect(200)).body.items[0].id).toBe(ids[0]);

      expect(
        (await list(a, '?q=boaz').expect(200)).body.items.map((c: { id: string }) => c.id),
      ).toEqual([ids[1]]);
      expect((await list(a, `?q=${encodeURIComponent('%_')}`).expect(200)).body.items).toEqual([]);
      await list(a, '?q=b').expect(400);
    });

    it('pages a long conversation from newest to oldest with no gap and no repeat', async () => {
      const { a, b, id } = await pair();
      // 10,000 messages, written straight into the database.
      await h.db.query(
        `INSERT INTO messages (id, conversation_id, seq, sender_id, body, created_at)
         SELECT gen_random_uuid(), $1, g, CASE WHEN g % 2 = 0 THEN $2::uuid ELSE $3::uuid END,
                'message ' || g, now() - (10001 - g) * interval '1 second'
         FROM generate_series(1, 10000) g`,
        [id, a.id, b.id],
      );
      await h.db.query(
        'UPDATE conversations SET last_seq = 10000, last_message_at = now() WHERE id = $1',
        [id],
      );

      const newest = (await messages(a, id).expect(200)).body;
      expect(newest.items).toHaveLength(50);
      expect(newest.hasMore).toBe(true);
      expect(newest.items[0].seq).toBe(9951);
      expect(newest.items.at(-1).seq).toBe(10000);

      const seen: number[] = newest.items.map((m: { seq: number }) => m.seq);
      let before = seen[0]!;
      for (let i = 0; i < 4; i++) {
        const page = (await messages(a, id, `?before=${before}&limit=100`).expect(200)).body;
        seen.unshift(...page.items.map((m: { seq: number }) => m.seq));
        before = page.items[0].seq;
      }
      expect(seen).toEqual(Array.from({ length: 450 }, (_, i) => 9551 + i));
      const oldest = (await messages(a, id, '?before=31&limit=100').expect(200)).body;
      expect(oldest.items.map((m: { seq: number }) => m.seq)).toEqual(
        Array.from({ length: 30 }, (_, i) => i + 1),
      );
      expect(oldest.hasMore).toBe(false);
      // Catching up after a lost connection: what came after a number, oldest first.
      const after = (await messages(a, id, '?after=9990').expect(200)).body;
      expect(after.items.map((m: { seq: number }) => m.seq)).toEqual(
        Array.from({ length: 10 }, (_, i) => 9991 + i),
      );
      expect(after.hasMore).toBe(false);

      // Unread: every message B sent that A has not read (A's marker is at 0).
      expect((await conversation(a, id).expect(200)).body.unreadCount).toBe(5000);
      await read(a, id).expect(204);
      expect((await conversation(a, id).expect(200)).body.unreadCount).toBe(0);

      // Both queries go through the (conversation, seq) index, not through the whole table.
      const plan = async (sql: string) =>
        (await h.db.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, [id])).rows
          .map((row) => row['QUERY PLAN'])
          .join('\n');
      const paging = await plan(
        'SELECT id FROM messages WHERE conversation_id = $1 AND seq < 5000 ORDER BY seq DESC LIMIT 51',
      );
      expect(paging).toContain('messages_conversation_id_seq_key');
      expect(paging).not.toContain('Seq Scan');
      const counting = await plan(
        'SELECT count(*) FROM messages WHERE conversation_id = $1 AND seq > 9900 AND deleted_at IS NULL',
      );
      expect(counting).toContain('messages_conversation_id_seq_key');
    });
  });

  describe('live events', () => {
    /** Collects what a person's stream receives until the test ends it. */
    async function listen(p: Person): Promise<{ events: ChatEvent[]; stop: () => void }> {
      const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
      const events: ChatEvent[] = [];
      const subscription = h.app
        .get(ChatStream)
        .open(p.id)
        .subscribe((event) => events.push(event));
      await bus.ready();
      return { events, stop: () => subscription.unsubscribe() };
    }
    const until = async (done: () => boolean) => {
      for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20));
    };

    it('reach the two people of a conversation and nobody else, and carry ids only', async () => {
      const { a, b, id } = await pair();
      const c = await listed();
      const [forA, forB, forC] = await Promise.all([listen(a), listen(b), listen(c)]);
      try {
        const sent = (await send(a, id, 'A secret between two').expect(201)).body;
        await until(() => forA.events.length > 0 && forB.events.length > 0);
        const expected = { type: 'message.new', conversationId: id, messageId: sent.id, seq: 1 };
        expect(forA.events).toContainEqual(expected);
        expect(forB.events).toContainEqual(expected);

        await read(b, id).expect(204);
        await until(() => forA.events.some((event) => event.type === 'markers'));
        expect(forA.events).toContainEqual({ type: 'markers', conversationId: id, userId: b.id });

        await h
          .http()
          .patch(`/api/v1/chat/messages/${sent.id}`)
          .set(bearer(a.token))
          .send({ body: 'Edited' })
          .expect(200);
        await h.http().delete(`/api/v1/chat/messages/${sent.id}`).set(bearer(a.token)).expect(204);
        await until(() => forB.events.some((event) => event.type === 'message.deleted'));
        expect(forB.events.map((event) => event.type)).toEqual(
          expect.arrayContaining(['message.new', 'message.edited', 'message.deleted']),
        );

        // Give a stray event time to arrive, then: C received nothing, and no event holds text.
        await new Promise((r) => setTimeout(r, 150));
        expect(forC.events).toEqual([]);
        expect(JSON.stringify([...forA.events, ...forB.events])).not.toMatch(/secret|Edited/);
      } finally {
        forA.stop();
        forB.stop();
        forC.stop();
      }
    });

    it('"is typing" goes to the other person only, and nothing is stored', async () => {
      const { a, b, id } = await pair();
      const [forA, forB] = await Promise.all([listen(a), listen(b)]);
      try {
        const before = await h.db.query(
          'SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1',
          [id],
        );
        await h
          .http()
          .post(`/api/v1/chat/conversations/${id}/typing`)
          .set(bearer(a.token))
          .expect(204);
        await until(() => forB.events.length > 0);
        expect(forB.events).toEqual([{ type: 'typing', conversationId: id, userId: a.id }]);
        expect(forA.events).toEqual([]);
        const after = await h.db.query(
          'SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1',
          [id],
        );
        expect(after.rows[0].n).toBe(before.rows[0].n);
      } finally {
        forA.stop();
        forB.stop();
      }
    });

    it('a person has at most three streams: a fourth closes the oldest', async () => {
      const a = await member();
      const stream = h.app.get(ChatStream);
      const ended: number[] = [];
      const subscriptions = [1, 2, 3, 4].map((i) =>
        stream.open(a.id).subscribe({ complete: () => ended.push(i) }),
      );
      expect(ended).toEqual([1]);
      expect(stream.count(a.id)).toBe(3);
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      expect(stream.count(a.id)).toBe(0);
    });
  });
});
