import { RealtimeBus } from '../src/infra/realtime/realtime-bus';
import { type ChatEvent, ChatStream } from '../src/modules/chat';
import { ChatNotifier } from '../src/modules/chat/chat-notifier';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  expectAdminOnly,
  signInAdmin,
  startHarness,
} from './auth-harness';
import { type ChatPerson as Person, NOBODY, chatActors } from './chat-harness';

/**
 * M12: chat rooms. Everyone here is fictional. The two exit criteria are in "who may read a
 * room" (nothing of a room reaches someone who may not read it) and "who may moderate" (only
 * the room's own moderators and staff).
 */
describe('chat rooms (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string; email: string };
  const {
    tag,
    person,
    member,
    listed,
    endMembership,
    start,
    send,
    block,
    createRoom,
    room,
    join,
    leave,
    roomSend,
    roomMessages,
    makeModerator,
    react,
    roomWith,
  } = chatActors(
    () => h,
    () => admin.accessToken,
  );
  const staff = () => ({ token: admin.accessToken, id: admin.userId }) as Person;
  const code = (res: { body: { error: { details?: { code: string }[] } } }) =>
    res.body.error.details?.[0]?.code;
  const get = (as: Person, path: string) =>
    h.http().get(`/api/v1/chat/${path}`).set(bearer(as.token));
  const post = (as: Person, path: string, body: object = {}) =>
    h.http().post(`/api/v1/chat/${path}`).set(bearer(as.token)).send(body);
  const del = (as: Person, path: string) =>
    h.http().delete(`/api/v1/chat/${path}`).set(bearer(as.token));
  /** Staff's own routes. A new room is the default organisation's unless the test says whose. */
  const adminPost = (path: string, body: object = {}) =>
    h
      .http()
      .post(`/api/v1/admin/chat/${path}`)
      .set(bearer(admin.accessToken))
      .send(path === 'rooms' ? { organisationId: DEFAULT_ORGANISATION, ...body } : body);
  const notices = async (p: Person) =>
    (
      await h.db.query<{ type: string; params: Record<string, string>; link: string }>(
        `SELECT type, params, link FROM notifications
         WHERE user_id = $1 AND kind = 'ROOMS' ORDER BY created_at, type`,
        [p.id],
      )
    ).rows;
  const auditOf = async (roomId: string) =>
    (
      await h.db.query<{ action: string }>(
        `SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'chat.room.%' ORDER BY at`,
        [roomId],
      )
    ).rows.map((row) => row.action);

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'rooms-admin');
  });

  afterAll(async () => {
    await h.close();
  });

  describe('finding and joining', () => {
    it('needs a signed-in account on every route', async () => {
      const id = NOBODY;
      for (const path of [
        'rooms',
        'rooms/mine',
        'room-categories',
        `rooms/${id}`,
        `rooms/${id}/members`,
        `rooms/${id}/messages`,
        `rooms/${id}/pins`,
        `rooms/${id}/bans`,
      ]) {
        await h.http().get(`/api/v1/chat/${path}`).expect(401);
      }
      for (const path of [
        `rooms/${id}/join`,
        `rooms/${id}/leave`,
        `rooms/${id}/messages`,
        `rooms/${id}/read`,
        `rooms/${id}/typing`,
        `rooms/${id}/lock`,
        `rooms/${id}/unlock`,
        `rooms/${id}/bans`,
        `rooms/${id}/pins/${id}`,
        `rooms/${id}/members/${id}/remove`,
      ]) {
        await h.http().post(`/api/v1/chat/${path}`).send({}).expect(401);
      }
      await h.http().put(`/api/v1/chat/messages/${id}/reactions/like`).expect(401);
      await h.http().delete(`/api/v1/chat/rooms/${id}/messages/${id}`).expect(401);
    });

    it('lists open rooms for active members, by name and category', async () => {
      const name = tag();
      const category = (
        await adminPost('room-categories', {
          key: `CAT_${name.toUpperCase()}`,
          nameHe: 'קטגוריה',
          nameEn: 'Category',
        }).expect(201)
      ).body.id as string;
      const inCategory = await createRoom({
        nameHe: `חדר ${name}`,
        nameEn: `Room ${name}`,
        descriptionHe: 'תיאור',
        categoryId: category,
      });
      const other = await createRoom({ nameHe: `אחר ${name}` });
      const viewer = await member();

      const found = (await get(viewer, `rooms?q=${name}`).expect(200)).body;
      expect(found.items.map((r: { id: string }) => r.id).sort()).toEqual(
        [inCategory, other].sort(),
      );
      expect(found.items.find((r: { id: string }) => r.id === inCategory)).toMatchObject({
        nameHe: `חדר ${name}`,
        nameEn: `Room ${name}`,
        descriptionHe: 'תיאור',
        category: { id: category, nameEn: 'Category' },
        memberCount: 0,
        role: 'NONE',
        unreadCount: 0,
        locked: false,
        archived: false,
      });
      expect(
        (await get(viewer, `rooms?q=${name}&categoryId=${category}`).expect(200)).body.items.map(
          (r: { id: string }) => r.id,
        ),
      ).toEqual([inCategory]);
      // The English name is searched too; one letter is not enough.
      expect((await get(viewer, `rooms?q=Room%20${name}`).expect(200)).body.items).toHaveLength(1);
      await get(viewer, 'rooms?q=a').expect(400);
      expect(
        (await get(viewer, 'room-categories').expect(200)).body.items.map(
          (c: { id: string }) => c.id,
        ),
      ).toContain(category);

      // Not for someone without an active membership.
      const outsider = await person();
      for (const path of ['rooms', 'room-categories', `rooms/${inCategory}`]) {
        expect(code(await get(outsider, path).expect(403))).toBe('membersOnly');
      }
      expect(code(await join(outsider, inCategory).expect(403))).toBe('membersOnly');
    });

    it('joining and leaving keep the count, and a newcomer starts with nothing unread', async () => {
      const id = await createRoom();
      const a = await member();
      const b = await member();
      await join(a, id).expect(200);
      await roomSend(a, id, 'Said before B came').expect(201);

      const joined = (await join(b, id).expect(200)).body;
      expect(joined).toMatchObject({
        role: 'MEMBER',
        memberCount: 2,
        unreadCount: 0,
        sendState: 'none',
      });
      // Joining again changes nothing.
      expect((await join(b, id).expect(200)).body.memberCount).toBe(2);
      // What was said before is there to read.
      expect((await roomMessages(b, id).expect(200)).body.items).toHaveLength(1);
      expect(
        (await get(b, 'rooms/mine').expect(200)).body.items.map((r: { id: string }) => r.id),
      ).toEqual([id]);

      await leave(b, id).expect(204);
      await leave(b, id).expect(204);
      expect((await room(a, id).expect(200)).body.memberCount).toBe(1);
      expect((await get(b, 'rooms/mine').expect(200)).body.items).toEqual([]);
      // What B wrote would stay; A's message is still there for A.
      expect((await roomMessages(a, id).expect(200)).body.items).toHaveLength(1);
    });

    it('counts everyone once when many join at the same moment', async () => {
      const id = await createRoom();
      const people: Person[] = [];
      for (let i = 0; i < 8; i++) people.push(await member());
      await Promise.all(people.flatMap((p) => [join(p, id), join(p, id)]));
      expect((await room(people[0]!, id).expect(200)).body.memberCount).toBe(8);
      const { rows } = await h.db.query(
        'SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id = $1',
        [id],
      );
      expect(rows[0].n).toBe(8);
    });

    it('needs a name to join, because the room sees it', async () => {
      const id = await createRoom();
      const nameless = await person('HONORARY_MEMBER');
      expect(code(await join(nameless, id).expect(422))).toBe('chatNameRequired');
    });
  });

  describe('who may read a room (exit criterion)', () => {
    it('nothing of a room reaches someone who is not in it', async () => {
      const { id, mod, a, b } = await roomWith();
      const secret = `Only for the room ${tag()}`;
      const sent = (await roomSend(a, id, secret).expect(201)).body;
      await post(mod, `rooms/${id}/pins/${sent.id}`).expect(204);

      const notJoined = await member();
      const removed = await member();
      await join(removed, id).expect(200);
      await post(mod, `rooms/${id}/members/${removed.id}/remove`, {
        reason: 'Test removal',
      }).expect(204);
      const banned = await member();
      await join(banned, id).expect(200);
      await post(mod, `rooms/${id}/bans`, {
        userId: banned.id,
        reason: 'Test ban',
        days: null,
      }).expect(201);
      const formerMember = await person(); // no membership at all

      const reads: [string, (p: Person) => Promise<{ status: number; body: unknown }>][] = [
        ['messages', (p) => roomMessages(p, id)],
        ['messages after', (p) => roomMessages(p, id, '?after=0')],
        ['members', (p) => get(p, `rooms/${id}/members`)],
        ['pins', (p) => get(p, `rooms/${id}/pins`)],
        ['search', (p) => get(p, `search?q=${encodeURIComponent(secret)}&conversationId=${id}`)],
        ['send', (p) => roomSend(p, id, 'Let me in')],
        ['read', (p) => post(p, `rooms/${id}/read`)],
        ['react', (p) => react(p, sent.id, 'like')],
        ['direct route', (p) => get(p, `conversations/${id}/messages`)],
        [
          'edit',
          (p) =>
            h
              .http()
              .patch(`/api/v1/chat/messages/${sent.id}`)
              .set(bearer(p.token))
              .send({ body: 'x' }),
        ],
        ['hide', (p) => post(p, `messages/${sent.id}/hide`)],
      ];
      for (const reader of [notJoined, removed, banned, formerMember]) {
        for (const [name, call] of reads) {
          const res = await call(reader);
          expect([name, res.status >= 400 && res.status < 500]).toEqual([name, true]);
          // Whatever the refusal says, it never carries the room's content.
          expect(JSON.stringify(res.body)).not.toContain(secret);
        }
        // A search across everything finds nothing of it either.
        const everywhere = await get(reader, `search?q=${encodeURIComponent(secret)}`);
        expect(JSON.stringify(everywhere.body)).not.toContain(secret);
      }
      // A member who has not joined is told to join; someone outside the association is told
      // that rooms are for members; an invented room is not found.
      expect(code(await roomMessages(notJoined, id).expect(403))).toBe('chatRoomNotJoined');
      expect(code(await roomMessages(banned, id).expect(403))).toBe('chatRoomNotJoined');
      expect(code(await roomMessages(formerMember, id).expect(403))).toBe('membersOnly');
      await roomMessages(notJoined, NOBODY).expect(404);
      await room(notJoined, NOBODY).expect(404);
      // The people in the room read it.
      expect((await roomMessages(b, id).expect(200)).body.items[0].body).toBe(secret);
    });

    it('a private conversation is still not reachable through the room routes', async () => {
      const a = await member();
      const b = await listed();
      const conversationId = (await start(a, b.id).expect(201)).body.id as string;
      await send(a, conversationId, 'Between two').expect(201);
      const c = await member();
      await room(c, conversationId).expect(404);
      await roomMessages(c, conversationId).expect(404);
      await join(c, conversationId).expect(404);
      // Nor is it reachable for its own people as a room.
      await roomMessages(a, conversationId).expect(404);
      // Staff, who may read rooms, still can't read it.
      await roomMessages(staff(), conversationId).expect(404);
      await get(staff(), `conversations/${conversationId}/messages`).expect(404);
    });

    it('someone whose membership ended reads the rooms they are in, and can’t write', async () => {
      const { id, a, b } = await roomWith();
      await roomSend(b, id, 'Before').expect(201);
      await endMembership(a, 'suspend');
      expect((await roomMessages(a, id).expect(200)).body.items).toHaveLength(1);
      expect((await room(a, id).expect(200)).body.sendState).toBe('membersOnly');
      expect(code(await roomSend(a, id, 'After').expect(403))).toBe('membersOnly');
      // They keep the platform, so the list still opens; but the organisation's rooms are no
      // longer for them: none is listed, and another one can't be joined.
      const other = await createRoom();
      const listed = (await get(a, 'rooms').expect(200)).body.items as { id: string }[];
      expect(listed.map((item) => item.id)).not.toContain(other);
      expect(listed.map((item) => item.id)).not.toContain(id);
      await join(a, other).expect(404);
      await room(a, other).expect(404);
    });

    it('staff with the chat permission read any room without joining, and don’t write', async () => {
      const { id, a } = await roomWith();
      await roomSend(a, id, 'In the open').expect(201);
      const view = (await room(staff(), id).expect(200)).body;
      expect(view).toMatchObject({ role: 'NONE', canModerate: true, sendState: 'notJoined' });
      expect((await roomMessages(staff(), id).expect(200)).body.items[0].body).toBe('In the open');
      expect(code(await roomSend(staff(), id, 'From staff').expect(403))).toBe('chatRoomNotJoined');
      expect((await room(a, id).expect(200)).body.memberCount).toBe(3);
    });
  });

  describe('messages in a room', () => {
    it('show who wrote them, count as unread for the others, and can be replied to', async () => {
      const { id, a, b } = await roomWith();
      const first = (await roomSend(a, id, '  שלום לכולם  ').expect(201)).body;
      expect(first).toMatchObject({
        seq: 1,
        body: 'שלום לכולם',
        mine: true,
        sender: { id: a.id, firstName: 'Avi', listed: false },
        announcement: false,
        removedByModerator: false,
        senderBlocked: false,
        mentions: [],
        reactions: [],
      });
      expect((await room(b, id).expect(200)).body).toMatchObject({ unreadCount: 1, lastSeq: 1 });
      expect((await get(b, 'unread-count').expect(200)).body.conversations).toBe(1);
      const reply = (await roomSend(b, id, 'שלום אבי', { replyToId: first.id }).expect(201)).body;
      expect(reply.replyTo).toMatchObject({ id: first.id, body: 'שלום לכולם', senderId: a.id });
      expect((await room(b, id).expect(200)).body.unreadCount).toBe(0);

      await post(a, `rooms/${id}/read`).expect(204);
      expect((await room(a, id).expect(200)).body).toMatchObject({
        unreadCount: 0,
        myLastReadSeq: 2,
      });
      // A room keeps two numbers per person, never a row per message and reader.
      const { rows } = await h.db.query(
        'SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id = $1',
        [id],
      );
      expect(rows[0].n).toBe(3);
    });

    it('refuses malformed input and keeps HTML as plain text', async () => {
      const { id, a, b } = await roomWith();
      await roomSend(a, id, '').expect(400);
      await roomSend(a, id, 'x'.repeat(4001)).expect(400);
      await roomSend(a, id, 'ok', { replyToId: NOBODY }).expect(400);
      await roomSend(a, id, 'ok', { extra: 1 }).expect(400);
      const script = '<script>alert(1)</script> <b>bold</b>';
      await roomSend(a, id, script).expect(201);
      expect((await roomMessages(b, id).expect(200)).body.items.at(-1).body).toBe(script);
      const key = `room-${tag()}`;
      const once = await roomSend(a, id, 'Once').set('Idempotency-Key', key).expect(201);
      const twice = await roomSend(a, id, 'Once').set('Idempotency-Key', key).expect(200);
      expect(twice.body.id).toBe(once.body.id);
    });

    it('mentions only people in the room, ten at most', async () => {
      const { id, a, b, mod } = await roomWith();
      const outsider = await member();
      const sent = (
        await roomSend(a, id, '@Bella @Mod look', { mentions: [b.id, mod.id, b.id] }).expect(201)
      ).body;
      expect(sent.mentions.map((m: { id: string }) => m.id).sort()).toEqual([b.id, mod.id].sort());
      expect(sent.mentions.find((m: { id: string }) => m.id === b.id).firstName).toBe('Bella');
      expect(code(await roomSend(a, id, '@x', { mentions: [outsider.id] }).expect(400))).toBe(
        'chatMentionNotInRoom',
      );
      await roomSend(a, id, '@x', { mentions: ['not-an-id'] }).expect(400);
      await roomSend(a, id, 'too many', {
        mentions: Array.from(
          { length: 11 },
          (_, i) => `0190a000-0000-7000-8000-0000000000${(10 + i).toString(16)}`,
        ),
      }).expect(400);
    });

    it('an announcements room takes messages from moderators only', async () => {
      const { id, mod, a } = await roomWith({ moderatorsOnly: true });
      expect((await room(a, id).expect(200)).body.sendState).toBe('moderatorsOnly');
      expect(code(await roomSend(a, id, 'May I?').expect(403))).toBe('chatModeratorsOnly');
      const sent = (await roomSend(mod, id, 'הודעה חשובה', { announcement: true }).expect(201))
        .body;
      expect(sent.announcement).toBe(true);
      // Members still read and react.
      await react(a, sent.id, 'thanks').expect(200);
      // Outside such a room too, only a moderator can mark an announcement.
      const open = await roomWith();
      expect(
        code(await roomSend(open.a, open.id, 'Mine', { announcement: true }).expect(403)),
      ).toBe('chatModeratorsOnly');
    });

    it('a locked room takes messages from moderators only, until it is unlocked or the time passes', async () => {
      const { id, mod, a } = await roomWith();
      expect((await post(mod, `rooms/${id}/lock`, { minutes: 30 }).expect(200)).body.locked).toBe(
        true,
      );
      expect((await room(a, id).expect(200)).body).toMatchObject({
        locked: true,
        sendState: 'locked',
      });
      expect(code(await roomSend(a, id, 'Locked out').expect(422))).toBe('chatRoomLocked');
      await roomSend(mod, id, 'Moderators still write').expect(201);
      // Reading, reacting and leaving still work.
      const last = (await roomMessages(a, id).expect(200)).body.items.at(-1);
      await react(a, last.id, 'like').expect(200);

      await h.db.query(
        `UPDATE conversations SET locked_until = now() - interval '1 minute' WHERE id = $1`,
        [id],
      );
      expect((await room(a, id).expect(200)).body).toMatchObject({
        locked: false,
        sendState: 'none',
      });
      await roomSend(a, id, 'The time passed').expect(201);

      await post(mod, `rooms/${id}/lock`, {}).expect(200);
      expect(code(await roomSend(a, id, 'Locked again').expect(422))).toBe('chatRoomLocked');
      expect((await post(mod, `rooms/${id}/unlock`).expect(200)).body.locked).toBe(false);
      await roomSend(a, id, 'Open').expect(201);
      await post(mod, `rooms/${id}/lock`, { minutes: 0 }).expect(400);
    });

    it('folds messages from someone the reader blocked, and is found by search with its room', async () => {
      const { id, a, b } = await roomWith({ nameEn: `Searchable ${tag()}` });
      const word = tag();
      await roomSend(a, id, `A word to find ${word}`).expect(201);
      const blockerView = async () =>
        (await roomMessages(b, id).expect(200)).body.items[0].senderBlocked;
      expect(await blockerView()).toBe(false);
      // Only a listed member (or a private conversation partner) can be blocked, so A joins
      // the directory first.
      await h
        .http()
        .post('/api/v1/me/consents')
        .set(bearer(a.token))
        .send({ kind: 'DIRECTORY', granted: true })
        .expect(200);
      await block(b, a.id).expect(204);
      expect(await blockerView()).toBe(true);

      const found = (await get(b, `search?q=${word}`).expect(200)).body.items;
      expect(found).toHaveLength(1);
      expect(found[0].room).toMatchObject({ id });
      expect(found[0].other.id).toBeNull();
      expect(
        (await get(b, `search?q=${word}&conversationId=${id}`).expect(200)).body.items,
      ).toHaveLength(1);
      // Someone who is not in the room finds nothing.
      expect((await get(await member(), `search?q=${word}`).expect(200)).body.items).toEqual([]);
    });
  });

  describe('reactions', () => {
    it('are one of each kind per person, counted, and only from the fixed set', async () => {
      const { id, a, b } = await roomWith();
      const sent = (await roomSend(a, id, 'React to me').expect(201)).body;
      await react(b, sent.id, 'like').expect(200);
      await react(b, sent.id, 'like').expect(200);
      await react(a, sent.id, 'like').expect(200);
      const reacted = (await react(b, sent.id, 'heart').expect(200)).body;
      expect(reacted.reactions).toEqual([
        { reaction: 'like', count: 2, mine: true },
        { reaction: 'heart', count: 1, mine: true },
      ]);
      expect((await roomMessages(a, id).expect(200)).body.items[0].reactions).toEqual([
        { reaction: 'like', count: 2, mine: true },
        { reaction: 'heart', count: 1, mine: false },
      ]);
      expect((await react(b, sent.id, 'like', false).expect(200)).body.reactions).toEqual([
        { reaction: 'like', count: 1, mine: false },
        { reaction: 'heart', count: 1, mine: true },
      ]);
      await react(b, sent.id, 'party').expect(400);
      await react(b, NOBODY, 'like').expect(404);
      await react(await member(), sent.id, 'like').expect(404);
      // Nobody is told about a reaction.
      expect(await notices(a)).toEqual([]);
    });

    it('work in a private conversation too', async () => {
      const a = await member();
      const b = await listed();
      const conversationId = (await start(a, b.id).expect(201)).body.id as string;
      const sent = (await send(a, conversationId, 'Thanks?').expect(201)).body;
      expect((await react(b, sent.id, 'thanks').expect(200)).body.reactions).toEqual([
        { reaction: 'thanks', count: 1, mine: true },
      ]);
      await react(await member(), sent.id, 'thanks').expect(404);
    });
  });

  describe('who may moderate (exit criterion)', () => {
    it('only the room’s own moderators and staff, for every action', async () => {
      const { id, mod, a, b } = await roomWith();
      const elsewhere = await roomWith();
      const target = (await roomSend(b, id, 'A message to act on').expect(201)).body.id as string;
      const victim = await member();
      await join(victim, id).expect(200);

      const actions: [string, (p: Person) => Promise<{ status: number }>][] = [
        ['pin', (p) => post(p, `rooms/${id}/pins/${target}`)],
        ['unpin', (p) => del(p, `rooms/${id}/pins/${target}`)],
        ['bans', (p) => get(p, `rooms/${id}/bans`)],
        ['lock', (p) => post(p, `rooms/${id}/lock`, { minutes: 5 })],
        ['unlock', (p) => post(p, `rooms/${id}/unlock`)],
        ['remove message', (p) => del(p, `rooms/${id}/messages/${target}`)],
        [
          'remove member',
          (p) => post(p, `rooms/${id}/members/${victim.id}/remove`, { reason: 'Because' }),
        ],
        [
          'ban',
          (p) => post(p, `rooms/${id}/bans`, { userId: victim.id, reason: 'Because', days: 1 }),
        ],
        ['lift ban', (p) => post(p, `rooms/${id}/bans/${NOBODY}/lift`)],
      ];
      // An ordinary member of the room is refused; a moderator of another room, who is not in
      // this one, finds nothing to moderate.
      for (const [name, act] of actions) {
        expect([name, (await act(a)).status]).toEqual([name, 403]);
        expect([name, (await act(elsewhere.mod)).status]).toEqual([name, 404]);
      }
      // Nothing happened.
      expect((await room(b, id).expect(200)).body).toMatchObject({ locked: false, memberCount: 4 });
      expect((await roomMessages(b, id).expect(200)).body.items[0].deleted).toBe(false);
      expect(await auditOf(id)).toEqual(['chat.room.create', 'chat.room.moderator.add']);

      // The room's moderator can do each of them.
      await post(mod, `rooms/${id}/pins/${target}`).expect(204);
      expect((await get(a, `rooms/${id}/pins`).expect(200)).body.items[0].message.id).toBe(target);
      await del(mod, `rooms/${id}/pins/${target}`).expect(204);
      await post(mod, `rooms/${id}/lock`, { minutes: 5 }).expect(200);
      await post(mod, `rooms/${id}/unlock`).expect(200);
      await del(mod, `rooms/${id}/messages/${target}`).expect(204);
      const gone = (await roomMessages(b, id).expect(200)).body.items[0];
      expect(gone).toMatchObject({ id: target, body: '', deleted: true, removedByModerator: true });
      await post(mod, `rooms/${id}/members/${victim.id}/remove`, { reason: 'Because' }).expect(204);
      await join(victim, id).expect(200);
      const ban = (
        await post(mod, `rooms/${id}/bans`, {
          userId: victim.id,
          reason: 'Because',
          days: 1,
        }).expect(201)
      ).body;
      expect(ban).toMatchObject({ user: { id: victim.id }, active: true });
      expect((await get(mod, `rooms/${id}/bans`).expect(200)).body.items).toHaveLength(1);
      await post(mod, `rooms/${id}/bans/${ban.id}/lift`).expect(200);

      // Staff too, without being in the room.
      await post(staff(), `rooms/${id}/lock`, {}).expect(200);
      await post(staff(), `rooms/${id}/unlock`).expect(200);
      expect(await auditOf(id)).toEqual([
        'chat.room.create',
        'chat.room.moderator.add',
        'chat.room.pin',
        'chat.room.unpin',
        'chat.room.lock',
        'chat.room.unlock',
        'chat.room.message.remove',
        'chat.room.member.remove',
        'chat.room.ban',
        'chat.room.ban.lift',
        'chat.room.lock',
        'chat.room.unlock',
      ]);
      // The audit log never holds the text of a message.
      const audit = await h.db.query(`SELECT changes FROM audit_logs WHERE entity_id = $1`, [id]);
      expect(JSON.stringify(audit.rows)).not.toContain('A message to act on');
    });

    it('a moderator doesn’t act on another moderator or on themselves; staff do', async () => {
      const { id, mod } = await roomWith();
      const second = await member('Second');
      await makeModerator(id, second);
      expect(
        code(
          await post(mod, `rooms/${id}/members/${second.id}/remove`, { reason: 'Rival' }).expect(
            403,
          ),
        ),
      ).toBe('chatModerateModerator');
      expect(
        code(
          await post(mod, `rooms/${id}/bans`, {
            userId: second.id,
            reason: 'Rival',
            days: 1,
          }).expect(403),
        ),
      ).toBe('chatModerateModerator');
      expect(
        code(
          await post(mod, `rooms/${id}/bans`, { userId: mod.id, reason: 'Myself', days: 1 }).expect(
            403,
          ),
        ),
      ).toBe('chatModerateSelf');
      await post(staff(), `rooms/${id}/members/${second.id}/remove`, {
        reason: 'Staff decision',
      }).expect(204);
      expect(
        (await room(mod, id).expect(200)).body.moderators.map((m: { id: string }) => m.id),
      ).toEqual([mod.id]);
    });

    it('a moderator whose membership ended moderates nothing', async () => {
      const { id, mod } = await roomWith();
      await endMembership(mod, 'suspend');
      expect((await room(mod, id).expect(200)).body.canModerate).toBe(false);
      await post(mod, `rooms/${id}/lock`, {}).expect(403);
    });

    it('a removed person may join again; a banned one may not, until the ban ends or is lifted', async () => {
      const { id, mod, a, b } = await roomWith();
      await post(mod, `rooms/${id}/members/${a.id}/remove`, { reason: 'Cool down' }).expect(204);
      expect((await room(b, id).expect(200)).body.memberCount).toBe(2);
      await join(a, id).expect(200);

      const ban = (
        await post(mod, `rooms/${id}/bans`, { userId: a.id, reason: 'Enough', days: 2 }).expect(201)
      ).body;
      expect((await room(b, id).expect(200)).body.memberCount).toBe(2);
      expect((await room(a, id).expect(200)).body).toMatchObject({ role: 'NONE', banned: true });
      expect(code(await join(a, id).expect(403))).toBe('chatRoomBanned');
      expect(
        code(
          await post(mod, `rooms/${id}/bans`, { userId: a.id, reason: 'Twice', days: 2 }).expect(
            409,
          ),
        ),
      ).toBe('chatAlreadyBanned');
      // A ban is for one room: another room is open to them.
      await join(a, await createRoom()).expect(200);

      await h.db.query(
        `UPDATE conversation_bans SET starts_at = now() - interval '3 days', ends_at = now() - interval '1 day'
         WHERE id = $1`,
        [ban.id],
      );
      await join(a, id).expect(200);
      const again = (
        await post(mod, `rooms/${id}/bans`, { userId: a.id, reason: 'Again', days: null }).expect(
          201,
        )
      ).body;
      expect(again.endsAt).toBeNull();
      await post(mod, `rooms/${id}/bans/${again.id}/lift`).expect(200);
      await join(a, id).expect(200);
    });

    it('holds five pins at most, and a deleted message is no longer pinned', async () => {
      const { id, mod, a } = await roomWith();
      const ids: string[] = [];
      for (let i = 1; i <= 6; i++)
        ids.push((await roomSend(a, id, `pin ${i}`).expect(201)).body.id);
      for (const messageId of ids.slice(0, 5))
        await post(mod, `rooms/${id}/pins/${messageId}`).expect(204);
      await post(mod, `rooms/${id}/pins/${ids[0]}`).expect(204); // already pinned: nothing changes
      expect(code(await post(mod, `rooms/${id}/pins/${ids[5]}`).expect(422))).toBe('chatPinLimit');
      // The database keeps the limit too.
      await expect(
        h.db.query(
          `INSERT INTO message_pins (conversation_id, message_id, pinned_by) VALUES ($1, $2, $3)`,
          [id, ids[5], mod.id],
        ),
      ).rejects.toThrow(/at most five/);
      await del(mod, `rooms/${id}/messages/${ids[0]}`).expect(204);
      const pins = (await get(a, `rooms/${id}/pins`).expect(200)).body.items;
      expect(pins.map((p: { message: { body: string } }) => p.message.body)).toEqual([
        'pin 5',
        'pin 4',
        'pin 3',
        'pin 2',
      ]);
      await post(mod, `rooms/${id}/pins/${ids[0]}`).expect(404); // a deleted message can't be pinned
      await post(mod, `rooms/${id}/pins/${NOBODY}`).expect(404);
    });
  });

  describe('notices', () => {
    /**
     * The rooms' switch, stored as the settings page stored it before rooms closed (M25): the
     * page no longer offers it, and the room notices it governs stay in the code, unused.
     */
    const setRoomSwitch = async (userId: string, app: boolean, email: boolean) => {
      for (const [channel, enabled] of [
        ['APP', app],
        ['EMAIL', email],
      ] as const) {
        await h.db.query(
          `INSERT INTO notification_preferences (user_id, kind, channel, enabled, updated_at)
           VALUES ($1, 'ROOMS', $2, $3, now())
           ON CONFLICT (user_id, kind, channel) DO UPDATE SET enabled = EXCLUDED.enabled`,
          [userId, channel, enabled],
        );
      }
    };

    it('a mention, a reply and an announcement each make one notice, the most personal one', async () => {
      const { id, mod, a, b } = await roomWith({ nameEn: 'Notices room' });
      const first = (await roomSend(b, id, 'A question').expect(201)).body;
      // A replies to B and mentions the moderator; B is also mentioned.
      await roomSend(a, id, '@Mod @Bella see this', {
        replyToId: first.id,
        mentions: [mod.id, b.id],
      }).expect(201);
      expect(await notices(b)).toEqual([
        {
          type: 'chatMention',
          params: expect.objectContaining({
            titleEn: 'Notices room',
            name: expect.stringContaining('Avi'),
          }),
          link: `/chat/rooms/${id}`,
        },
      ]);
      expect((await notices(mod)).map((n) => n.type)).toEqual(['chatMention']);
      expect(await notices(a)).toEqual([]);

      // A plain reply tells the person replied to.
      await roomSend(mod, id, 'An answer', { replyToId: first.id }).expect(201);
      expect((await notices(b)).map((n) => n.type)).toEqual(['chatMention', 'chatReply']);
      // An ordinary message tells nobody.
      await roomSend(a, id, 'Just talking').expect(201);
      expect((await notices(b)).length).toBe(2);

      // An announcement tells everyone in the room but its writer.
      await roomSend(mod, id, 'Top secret wording', { announcement: true }).expect(201);
      expect((await notices(a)).map((n) => n.type)).toEqual(['chatAnnouncement']);
      expect((await notices(b)).map((n) => n.type).sort()).toEqual([
        'chatAnnouncement',
        'chatMention',
        'chatReply',
      ]);
      expect((await notices(mod)).map((n) => n.type)).toEqual(['chatMention']);
      // The notice is under the bell, and never carries the message.
      const bell = (await h.http().get('/api/v1/notifications').set(bearer(a.token)).expect(200))
        .body;
      expect(bell.items[0]).toMatchObject({
        kind: 'ROOMS',
        type: 'chatAnnouncement',
        link: `/chat/rooms/${id}`,
      });
      expect(JSON.stringify(bell)).not.toContain('Top secret');
    });

    it('none from a muted room, from a blocked person, with the switch off, or to someone who left', async () => {
      const { id, mod, a, b } = await roomWith();
      const muter = await member();
      const blocker = await member();
      const switchedOff = await member();
      const leaver = await member();
      for (const p of [muter, blocker, switchedOff, leaver]) await join(p, id).expect(200);
      await h
        .http()
        .patch(`/api/v1/chat/rooms/${id}/me`)
        .set(bearer(muter.token))
        .send({ mute: 'forever' })
        .expect(200);
      await h.db.query(`INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [
        blocker.id,
        mod.id,
      ]);
      await setRoomSwitch(switchedOff.id, false, false);
      await leave(leaver, id).expect(204);

      await roomSend(mod, id, 'To all', {
        announcement: true,
        mentions: [muter.id, blocker.id, switchedOff.id],
      }).expect(201);
      for (const p of [muter, blocker, switchedOff, leaver]) expect(await notices(p)).toEqual([]);
      expect((await notices(a)).map((n) => n.type)).toEqual(['chatAnnouncement']);
      expect((await notices(b)).map((n) => n.type)).toEqual(['chatAnnouncement']);
    });

    it('room messages cause no "messages are waiting" email, unless the person asked for it', async () => {
      const { id, a, b } = await roomWith();
      const emails = (p: Person) =>
        h.mailer.sent.filter((m) => m.to === p.email && m.template === 'chatUnread');
      await setRoomSwitch(b.id, true, true);
      const mod = (await room(a, id).expect(200)).body.moderators[0].id as string;
      await roomSend(a, id, '@both', { mentions: [b.id, mod] }).expect(201);
      await h.db.query(
        `UPDATE notifications SET created_at = created_at - interval '40 minutes' WHERE kind = 'ROOMS'`,
      );
      await h.db.query(
        `UPDATE messages SET created_at = created_at - interval '40 minutes' WHERE conversation_id = $1`,
        [id],
      );
      await h.app.get(ChatNotifier).sendUnreadEmails();
      // B switched email on for rooms and gets one, without the text. The moderator, with the
      // starting settings, gets none, although the room holds an unread message for them.
      expect(emails(b)).toHaveLength(1);
      expect(JSON.stringify(emails(b)[0])).not.toContain('@both');
      const modEmail = (
        await h.db.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [mod])
      ).rows[0]!.email;
      expect(
        h.mailer.sent.filter((m) => m.to === modEmail && m.template === 'chatUnread'),
      ).toHaveLength(0);
    });
  });

  describe('live events', () => {
    async function listen(p: Person): Promise<{ events: ChatEvent[]; stop: () => void }> {
      const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
      const stream = h.app.get(ChatStream);
      const events: ChatEvent[] = [];
      const subscription = stream.open(p.id).subscribe((event) => events.push(event));
      await bus.ready();
      await stream.roomsKnown(p.id);
      return { events, stop: () => subscription.unsubscribe() };
    }
    const until = async (done: () => boolean) => {
      for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20));
    };
    const settle = () => new Promise((r) => setTimeout(r, 150));

    it('reach the people in the room and nobody else, name the room and not its people', async () => {
      const { id, mod, a, b } = await roomWith();
      const outsider = await member();
      const published: unknown[] = [];
      const bus = h.app.get(RealtimeBus);
      const original = bus.publish.bind(bus);
      const publish = jest.spyOn(bus, 'publish').mockImplementation(async (topic, payload) => {
        published.push(payload);
        return original(topic, payload);
      });
      const [forA, forB, forOut] = await Promise.all([listen(a), listen(b), listen(outsider)]);
      try {
        const sent = (await roomSend(a, id, 'Live in a room').expect(201)).body;
        await until(() => forB.events.some((e) => e.type === 'message.new'));
        const expected = { type: 'message.new', conversationId: id, messageId: sent.id, seq: 1 };
        expect(forA.events).toContainEqual(expected);
        expect(forB.events).toContainEqual(expected);
        // One small notification for the whole room: the room's id, and no list of people.
        const roomEvent = published.find((p) => (p as { room?: string }).room === id) as Record<
          string,
          unknown
        >;
        expect(roomEvent).toBeDefined();
        expect(roomEvent.to).toBeUndefined();
        expect(JSON.stringify(roomEvent)).not.toContain('Live in a room');

        // Typing goes to the others, not back to the typer.
        await post(a, `rooms/${id}/typing`).expect(204);
        await until(() => forB.events.some((e) => e.type === 'typing'));
        expect(forB.events).toContainEqual({ type: 'typing', conversationId: id, userId: a.id });
        expect(forA.events.some((e) => e.type === 'typing')).toBe(false);

        // A reaction and a pin are heard too.
        await react(b, sent.id, 'like').expect(200);
        await post(mod, `rooms/${id}/pins/${sent.id}`).expect(204);
        await until(() => forA.events.some((e) => e.type === 'room'));
        expect(forA.events.map((e) => e.type)).toEqual(
          expect.arrayContaining(['message.edited', 'room']),
        );

        await settle();
        expect(forOut.events).toEqual([]);
      } finally {
        publish.mockRestore();
        forA.stop();
        forB.stop();
        forOut.stop();
      }
    });

    it('someone who joins starts hearing the room, and someone removed stops at once', async () => {
      const { id, mod, a } = await roomWith();
      const late = await member();
      const [forLate, forA] = await Promise.all([listen(late), listen(a)]);
      try {
        await roomSend(mod, id, 'Before joining').expect(201);
        await settle();
        expect(forLate.events).toEqual([]);

        await join(late, id).expect(200);
        await settle();
        await roomSend(mod, id, 'After joining').expect(201);
        await until(() => forLate.events.some((e) => e.type === 'message.new'));
        expect(forLate.events.filter((e) => e.type === 'message.new')).toHaveLength(1);

        await post(mod, `rooms/${id}/members/${a.id}/remove`, { reason: 'Out' }).expect(204);
        await until(() => forA.events.some((e) => e.type === 'room.left'));
        expect(forA.events).toContainEqual({ type: 'room.left', conversationId: id });
        const heard = forA.events.filter((e) => e.type === 'message.new').length;
        await settle();
        await roomSend(mod, id, 'After the removal').expect(201);
        await settle();
        expect(forA.events.filter((e) => e.type === 'message.new')).toHaveLength(heard);
      } finally {
        forLate.stop();
        forA.stop();
      }
    });
  });

  describe('a large room (exit criterion)', () => {
    it('2,000 members and 10,000 messages: lists, pages, counts and events stay cheap', async () => {
      const id = await createRoom();
      const reader = await member();
      await join(reader, id).expect(200);
      const bulk = tag();
      try {
        // 2,000 fictional accounts in the room, and 10,000 messages, written straight in.
        await h.db.query(
          `INSERT INTO users (id, email, password_hash, updated_at)
           SELECT gen_random_uuid(), 'bulk-' || g || '-' || $1 || '@example.test', 'x', now()
           FROM generate_series(1, 1999) g`,
          [bulk],
        );
        await h.db.query(
          `INSERT INTO conversation_members (conversation_id, user_id)
           SELECT $1, id FROM users WHERE email LIKE 'bulk-%-' || $2 || '@example.test'`,
          [id, bulk],
        );
        await h.db.query(`UPDATE conversations SET member_count = 2000 WHERE id = $1`, [id]);
        await h.db.query(
          `INSERT INTO messages (id, conversation_id, seq, sender_id, body, created_at)
           SELECT gen_random_uuid(), $1, g,
                  (SELECT id FROM users WHERE email = 'bulk-' || (1 + g % 1999) || '-' || $2 || '@example.test'),
                  'room message ' || g, now() - (10001 - g) * interval '1 second'
           FROM generate_series(1, 10000) g`,
          [id, bulk],
        );
        await h.db.query(
          `UPDATE conversations SET last_seq = 10000, last_message_at = now() WHERE id = $1`,
          [id],
        );
        await h.db.query('ANALYZE conversation_members');
        await h.db.query('ANALYZE messages');

        const view = (await room(reader, id).expect(200)).body;
        expect(view).toMatchObject({ memberCount: 2000, unreadCount: 10000, lastSeq: 10000 });
        const page = (await roomMessages(reader, id).expect(200)).body;
        expect(page.items).toHaveLength(50);
        expect(page.items.at(-1).seq).toBe(10000);
        expect(page.hasMore).toBe(true);
        const older = (await roomMessages(reader, id, '?before=5001&limit=100').expect(200)).body;
        expect(older.items.map((m: { seq: number }) => m.seq)).toEqual(
          Array.from({ length: 100 }, (_, i) => 4901 + i),
        );
        const members = (await get(reader, `rooms/${id}/members`).expect(200)).body;
        expect(members).toMatchObject({ total: 2000, pageSize: 50 });
        expect(members.items).toHaveLength(50);
        await post(reader, `rooms/${id}/read`).expect(204);
        expect((await room(reader, id).expect(200)).body.unreadCount).toBe(0);

        // The queries behind them go through their indexes.
        const plan = async (sql: string, params: unknown[]) =>
          (await h.db.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, params)).rows
            .map((row) => row['QUERY PLAN'])
            .join('\n');
        const paging = await plan(
          'SELECT id FROM messages WHERE conversation_id = $1 AND seq < 5000 ORDER BY seq DESC LIMIT 51',
          [id],
        );
        expect(paging).toContain('messages_conversation_id_seq_key');
        expect(paging).not.toContain('Seq Scan');
        const unread = await plan(
          'SELECT count(*) FROM messages WHERE conversation_id = $1 AND seq > 9900 AND deleted_at IS NULL',
          [id],
        );
        expect(unread).toContain('messages_conversation_id_seq_key');
        const membership = await plan(
          'SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
          [id, reader.id],
        );
        // Whichever index the planner prefers, it never reads the whole table.
        expect(membership).toContain('Index');
        expect(membership).not.toContain('Seq Scan');

        // A message sent in it reaches an open page within two seconds, as one small event.
        const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
        const stream = h.app.get(ChatStream);
        const published: object[] = [];
        const original = bus.publish.bind(bus);
        const spy = jest.spyOn(bus, 'publish').mockImplementation(async (topic, payload) => {
          published.push(payload);
          return original(topic, payload);
        });
        const events: ChatEvent[] = [];
        const listener = await member();
        await join(listener, id).expect(200);
        const subscription = stream.open(listener.id).subscribe((event) => events.push(event));
        await bus.ready();
        await stream.roomsKnown(listener.id);
        try {
          const started = Date.now();
          await roomSend(reader, id, 'To two thousand').expect(201);
          for (let i = 0; i < 100 && !events.some((e) => e.type === 'message.new'); i++) {
            await new Promise((r) => setTimeout(r, 20));
          }
          expect(events.some((e) => e.type === 'message.new')).toBe(true);
          expect(Date.now() - started).toBeLessThan(2000);
          const roomEvents = published.filter((p) => (p as { room?: string }).room === id);
          expect(roomEvents.length).toBeGreaterThan(0);
          for (const event of roomEvents) expect(JSON.stringify(event).length).toBeLessThan(400);
        } finally {
          spy.mockRestore();
          subscription.unsubscribe();
        }
      } finally {
        await h.db.query(`DELETE FROM users WHERE email LIKE 'bulk-%-' || $1 || '@example.test'`, [
          bulk,
        ]);
      }
    }, 120_000);
  });

  describe('staff: rooms, categories and reasons', () => {
    it('every new admin route follows the admin access pattern', async () => {
      const base = '/api/v1/admin/chat';
      await expectAdminOnly(h, 'get', `${base}/rooms`);
      await expectAdminOnly(h, 'post', `${base}/rooms`, { nameHe: 'חדר' });
      await expectAdminOnly(h, 'get', `${base}/rooms/${NOBODY}`);
      await expectAdminOnly(h, 'put', `${base}/rooms/${NOBODY}`, { nameHe: 'חדר' });
      await expectAdminOnly(h, 'post', `${base}/rooms/${NOBODY}/archive`);
      await expectAdminOnly(h, 'post', `${base}/rooms/${NOBODY}/restore`);
      await expectAdminOnly(h, 'post', `${base}/rooms/${NOBODY}/moderators`, { userId: NOBODY });
      await expectAdminOnly(h, 'post', `${base}/rooms/${NOBODY}/moderators/${NOBODY}/remove`);
      await expectAdminOnly(h, 'get', `${base}/room-categories`);
      await expectAdminOnly(h, 'post', `${base}/room-categories`, {
        key: 'X1',
        nameHe: 'א',
        nameEn: 'A',
      });
      await expectAdminOnly(h, 'put', `${base}/room-categories/${NOBODY}`, {
        nameHe: 'א',
        nameEn: 'A',
      });
      await expectAdminOnly(h, 'delete', `${base}/room-categories/${NOBODY}`);
      await expectAdminOnly(h, 'get', `${base}/report-categories`);
      await expectAdminOnly(h, 'post', `${base}/report-categories`, {
        key: 'X1',
        nameHe: 'א',
        nameEn: 'A',
      });
      await expectAdminOnly(h, 'put', `${base}/report-categories/${NOBODY}`, {
        nameHe: 'א',
        nameEn: 'A',
      });
    });

    it('open, edit, archive and restore a room; two rooms can’t share a name', async () => {
      const name = `חדר ${tag()}`;
      const created = (
        await adminPost('rooms', { nameHe: name, descriptionEn: '  A place  ' }).expect(201)
      ).body;
      expect(created).toMatchObject({
        nameHe: name,
        nameEn: null,
        descriptionEn: 'A place',
        memberCount: 0,
        moderatorsOnly: false,
        archived: false,
        moderators: [],
      });
      expect(code(await adminPost('rooms', { nameHe: name }).expect(409))).toBe(
        'chatRoomNameTaken',
      );
      expect(code(await adminPost('rooms', { nameHe: name.toUpperCase() }).expect(409))).toBe(
        'chatRoomNameTaken',
      );
      await adminPost('rooms', { nameHe: 'x' }).expect(400);
      expect(
        code(await adminPost('rooms', { nameHe: `${name} 2`, categoryId: NOBODY }).expect(400)),
      ).toBe('unknownCategory');
      expect(
        code(await adminPost('rooms', { nameHe: `${name} 3`, pictureFileId: NOBODY }).expect(400)),
      ).toBe('unknownImage');

      const edited = (
        await h
          .http()
          .put(`/api/v1/admin/chat/rooms/${created.id}`)
          .set(bearer(admin.accessToken))
          .send({ nameHe: name, nameEn: 'Edited', moderatorsOnly: true })
          .expect(200)
      ).body;
      expect(edited).toMatchObject({ nameEn: 'Edited', moderatorsOnly: true, descriptionEn: null });

      const a = await member();
      await join(a, created.id).expect(200);
      const reader = await member();
      expect((await adminPost(`rooms/${created.id}/archive`).expect(200)).body.archived).toBe(true);
      // It leaves the list; the people in it keep it, read-only; nobody new gets in.
      expect(
        (await get(reader, `rooms?q=${encodeURIComponent(name)}`).expect(200)).body.items,
      ).toEqual([]);
      await room(reader, created.id).expect(404);
      await join(reader, created.id).expect(404);
      expect((await room(a, created.id).expect(200)).body).toMatchObject({
        archived: true,
        sendState: 'archived',
      });
      expect(code(await roomSend(a, created.id, 'Too late').expect(422))).toBe('chatRoomArchived');
      const list = (
        await h
          .http()
          .get(`/api/v1/admin/chat/rooms?archived=true&q=${encodeURIComponent(name)}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      expect(list.items.map((r: { id: string }) => r.id)).toEqual([created.id]);
      expect((await adminPost(`rooms/${created.id}/restore`).expect(200)).body.archived).toBe(
        false,
      );
      await join(reader, created.id).expect(200);
      expect(await auditOf(created.id)).toEqual([
        'chat.room.create',
        'chat.room.update',
        'chat.room.archive',
        'chat.room.restore',
      ]);
    });

    it('appoints and removes moderators; only an active member can be one', async () => {
      const id = await createRoom();
      const m = await member('Moderator');
      const appointed = (await adminPost(`rooms/${id}/moderators`, { userId: m.id }).expect(200))
        .body;
      // Someone who wasn't in the room is added to it.
      expect(appointed).toMatchObject({
        memberCount: 1,
        moderators: [{ id: m.id, firstName: 'Moderator' }],
      });
      expect((await room(m, id).expect(200)).body).toMatchObject({
        role: 'MODERATOR',
        canModerate: true,
      });
      // Appointing again changes nothing.
      expect(
        (await adminPost(`rooms/${id}/moderators`, { userId: m.id }).expect(200)).body.memberCount,
      ).toBe(1);

      const outsider = await person();
      expect(
        code(await adminPost(`rooms/${id}/moderators`, { userId: outsider.id }).expect(422)),
      ).toBe('chatModeratorNotMember');
      expect(code(await adminPost(`rooms/${id}/moderators`, { userId: NOBODY }).expect(422))).toBe(
        'chatModeratorNotMember',
      );

      const removed = (await adminPost(`rooms/${id}/moderators/${m.id}/remove`).expect(200)).body;
      expect(removed).toMatchObject({ memberCount: 1, moderators: [] });
      expect((await room(m, id).expect(200)).body).toMatchObject({
        role: 'MEMBER',
        canModerate: false,
      });
      await adminPost(`rooms/${id}/moderators/${m.id}/remove`).expect(404);
    });

    it('keeps the room categories; one in use can’t be deleted', async () => {
      const key = `K_${tag().toUpperCase()}`;
      const created = (
        await adminPost('room-categories', {
          key,
          nameHe: 'כנסים',
          nameEn: 'Conferences',
          sortOrder: 3,
        }).expect(201)
      ).body;
      expect(created).toMatchObject({ key, rooms: 0, sortOrder: 3 });
      expect(
        code(await adminPost('room-categories', { key, nameHe: 'א', nameEn: 'A' }).expect(409)),
      ).toBe('categoryKeyTaken');
      await adminPost('room-categories', { key: 'lower case', nameHe: 'א', nameEn: 'A' }).expect(
        400,
      );
      const renamed = (
        await h
          .http()
          .put(`/api/v1/admin/chat/room-categories/${created.id}`)
          .set(bearer(admin.accessToken))
          .send({ nameHe: 'כנסים ואירועים', nameEn: 'Conferences and events', sortOrder: 1 })
          .expect(200)
      ).body;
      expect(renamed).toMatchObject({ nameEn: 'Conferences and events', sortOrder: 1 });

      await createRoom({ categoryId: created.id });
      const remove = () =>
        h
          .http()
          .delete(`/api/v1/admin/chat/room-categories/${created.id}`)
          .set(bearer(admin.accessToken));
      expect(code(await remove().expect(422))).toBe('chatCategoryInUse');
      const unused = (
        await adminPost('room-categories', { key: `${key}_2`, nameHe: 'א', nameEn: 'A' }).expect(
          201,
        )
      ).body;
      await h
        .http()
        .delete(`/api/v1/admin/chat/room-categories/${unused.id}`)
        .set(bearer(admin.accessToken))
        .expect(204);
    });

    it('keeps the report reasons: a new one is offered, a switched-off one is not', async () => {
      const key = `R_${tag().toUpperCase()}`;
      const created = (
        await adminPost('report-categories', {
          key,
          nameHe: 'סיבה',
          nameEn: 'A new reason',
          sortOrder: 9,
        }).expect(201)
      ).body;
      const offered = async () =>
        (
          (await get(await member(), 'report-categories').expect(200)).body.items as {
            key: string;
          }[]
        ).map((c) => c.key);
      expect(await offered()).toContain(key);
      const update = (body: object) =>
        h
          .http()
          .put(`/api/v1/admin/chat/report-categories/${created.id}`)
          .set(bearer(admin.accessToken))
          .send(body);
      expect(
        (
          await update({ nameHe: 'סיבה', nameEn: 'Renamed', sortOrder: 9, active: false }).expect(
            200,
          )
        ).body,
      ).toMatchObject({
        nameEn: 'Renamed',
        active: false,
      });
      expect(await offered()).not.toContain(key);
      // Staff still see it, switched off.
      const all = (
        await h
          .http()
          .get('/api/v1/admin/chat/report-categories')
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body.items as { key: string; active: boolean }[];
      expect(all.find((c) => c.key === key)).toMatchObject({ active: false });
    });

    it('a room and a room message can be reported; staff can archive the room', async () => {
      const { id, a, b } = await roomWith({ nameEn: `Reported ${tag()}` });
      const categories = (await get(a, 'report-categories').expect(200)).body.items as {
        key: string;
        id: string;
      }[];
      const other = categories.find((c) => c.key === 'OTHER')!.id;
      for (let i = 1; i <= 8; i++) await roomSend(i % 2 ? a : b, id, `line ${i}`).expect(201);
      const lines = (await roomMessages(b, id).expect(200)).body.items as {
        id: string;
        seq: number;
      }[];

      // A message: the report keeps it and the ones around it, as in private chat.
      const aboutMessage = (
        await post(b, 'reports', { messageId: lines[6]!.id, categoryId: other }).expect(201)
      ).body.id;
      const detail = (
        await h
          .http()
          .get(`/api/v1/admin/chat/reports/${aboutMessage}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      expect(detail).toMatchObject({
        aboutMessage: true,
        aboutRoom: false,
        room: { id },
        reported: { id: a.id },
      });
      expect(detail.messages.map((m: { seq: number }) => m.seq)).toEqual([2, 3, 4, 5, 6, 7, 8]);
      // Someone who is not in the room can't report its message.
      await post(await member(), 'reports', { messageId: lines[6]!.id, categoryId: other }).expect(
        404,
      );

      // The room as such, by any active member.
      const outsider = await member();
      const aboutRoom = (
        await post(outsider, 'reports', {
          roomId: id,
          categoryId: other,
          description: 'Off topic',
        }).expect(201)
      ).body.id;
      expect(
        (await post(outsider, 'reports', { roomId: id, categoryId: other }).expect(200)).body.id,
      ).toBe(aboutRoom);
      await post(outsider, 'reports', { roomId: NOBODY, categoryId: other }).expect(404);
      await post(outsider, 'reports', { roomId: id, userId: a.id, categoryId: other }).expect(400);
      await post(await person(), 'reports', { roomId: id, categoryId: other }).expect(404);
      const roomReport = (
        await h
          .http()
          .get(`/api/v1/admin/chat/reports/${aboutRoom}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      expect(roomReport).toMatchObject({
        aboutRoom: true,
        aboutMessage: false,
        room: { id },
        reported: { id: null },
        messages: [],
        description: 'Off topic',
      });

      const resolve = (reportId: string, body: object) =>
        h
          .http()
          .post(`/api/v1/admin/chat/reports/${reportId}/resolve`)
          .set(bearer(admin.accessToken))
          .send(body);
      // A report about a person or a private message has no room to archive.
      const done = (
        await resolve(aboutRoom, { decision: 'archiveRoom', reason: 'The room went wrong' }).expect(
          200,
        )
      ).body;
      expect(done).toMatchObject({ status: 'UPHELD', action: 'ROOM_ARCHIVED' });
      expect((await room(a, id).expect(200)).body).toMatchObject({
        archived: true,
        sendState: 'archived',
      });
      // The message report can still be decided: the message is removed for the room.
      await resolve(aboutMessage, {
        decision: 'deleteMessage',
        reason: 'Against the rules',
      }).expect(200);
      expect((await roomMessages(b, id).expect(200)).body.items[6]).toMatchObject({
        deleted: true,
        removedByModerator: true,
      });
    });

    it('the dashboard and the Chat link count rooms too', async () => {
      const { id, a, b } = await roomWith();
      const count = async (p: Person) =>
        (await get(p, 'unread-count').expect(200)).body.conversations as number;
      expect(await count(b)).toBe(0);
      await roomSend(a, id, 'Unread in a room').expect(201);
      expect(await count(b)).toBe(1);
      await h
        .http()
        .patch(`/api/v1/chat/rooms/${id}/me`)
        .set(bearer(b.token))
        .send({ mute: '8h' })
        .expect(200);
      expect(await count(b)).toBe(0);
      // The private list is still only private conversations.
      expect((await get(b, 'conversations').expect(200)).body.items).toEqual([]);
    });
  });
});
