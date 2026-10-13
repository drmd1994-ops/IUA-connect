import sharp from 'sharp';
import { RealtimeBus } from '../src/infra/realtime/realtime-bus';
import { type ChatEvent, ChatStream } from '../src/modules/chat';
import { type Harness, bearer, signInAdmin, startHarness } from './auth-harness';
import { type ChatPerson as Person, NOBODY, chatActors } from './chat-harness';

/**
 * M13: group chats, invitations, rooms by invitation, online status, forwarding, pinned
 * conversations, and files in messages. Everyone here is fictional. The exit criteria are in
 * "who may read a group", "invitations", "rooms by invitation", "activity" and "files".
 */
describe('chat groups, invitations, activity and files (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string; email: string };
  const {
    tag,
    member,
    listed,
    endMembership,
    unverify,
    start,
    send,
    list,
    unread,
    block,
    chatSettings,
    createRoom,
    room,
    join,
    roomSend,
    roomMessages,
    makeModerator,
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
  const patch = (as: Person, path: string, body: object = {}) =>
    h.http().patch(`/api/v1/chat/${path}`).set(bearer(as.token)).send(body);
  const del = (as: Person, path: string) =>
    h.http().delete(`/api/v1/chat/${path}`).set(bearer(as.token));
  const SETTINGS = {
    audience: 'LISTED',
    readReceipts: true,
    typing: true,
    invitesFrom: 'LISTED',
    showActivity: true,
  };

  const makeGroup = (as: Person, userIds: string[] = [], name = `Group ${tag()}`) =>
    post(as, 'groups', { name, userIds });
  const invitations = async (as: Person) =>
    (await get(as, 'invitations').expect(200)).body.items as {
      id: string;
      kind: string;
      conversationId: string;
      name: string;
      memberCount: number;
      invitedBy: { id: string };
      members: { id: string }[];
    }[];
  const invitationTo = async (as: Person, conversationId: string) =>
    (await invitations(as)).find((item) => item.conversationId === conversationId)!;
  const accept = async (as: Person, conversationId: string) =>
    post(as, `invitations/${(await invitationTo(as, conversationId)).id}/accept`).expect(200);
  const groupSend = (as: Person, id: string, body: string, extra: object = {}) =>
    post(as, `groups/${id}/messages`, { body, ...extra });

  /** A group made by `a` (its admin) with `b` and `c` in it. All three are listed members. */
  async function groupOf() {
    const a = await listed('Avi');
    const b = await listed('Bella');
    const c = await listed('Carmel');
    const id = (await makeGroup(a, [b.id, c.id]).expect(201)).body.id as string;
    await accept(b, id);
    await accept(c, id);
    return { id, a, b, c };
  }

  async function listen(p: Person): Promise<{ events: ChatEvent[]; stop: () => void }> {
    const bus = h.app.get(RealtimeBus) as RealtimeBus & { ready(): Promise<void> };
    const stream = h.app.get(ChatStream);
    const events: ChatEvent[] = [];
    const subscription = stream.open(p.id).subscribe((event) => events.push(event));
    await bus.ready();
    await stream.roomsKnown(p.id);
    return { events, stop: () => subscription.unsubscribe() };
  }
  const until = async (done: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 100 && !(await done()); i++) await new Promise((r) => setTimeout(r, 20));
  };
  const settle = () => new Promise((r) => setTimeout(r, 150));

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'groups-admin');
  });

  afterAll(async () => {
    await h.close();
  });

  describe('who may read a group (exit criterion)', () => {
    it('nothing of a group reaches someone who is not in it, staff included', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const invited = await listed('Inbal');
      const id = (await makeGroup(a, [b.id, invited.id], 'A private group').expect(201)).body
        .id as string;
      await accept(b, id);
      const sent = (await groupSend(a, id, 'Only for the group').expect(201)).body;
      const outsider = await listed('Omer');
      const removed = await listed('Rami');
      await post(a, `groups/${id}/invitations`, { userIds: [removed.id] }).expect(204);
      await accept(removed, id);
      await post(a, `groups/${id}/members/${removed.id}/remove`).expect(204);

      // An outsider, someone invited who has not accepted, someone removed, and staff.
      for (const who of [outsider, invited, removed, staff()]) {
        for (const invented of [id, NOBODY]) {
          await get(who, `groups/${invented}`).expect(404);
          await get(who, `groups/${invented}/members`).expect(404);
          await get(who, `groups/${invented}/messages`).expect(404);
          await groupSend(who, invented, 'Let me in').expect(404);
          await post(who, `groups/${invented}/read`).expect(404);
          await post(who, `groups/${invented}/typing`).expect(404);
          await patch(who, `groups/${invented}`, { name: 'Mine now' }).expect(404);
          await patch(who, `groups/${invented}/me`, { mute: 'forever' }).expect(404);
          await post(who, `groups/${invented}/leave`).expect(404);
          await post(who, `groups/${invented}/admin`, { userId: who.id }).expect(404);
          await post(who, `groups/${invented}/members/${b.id}/remove`).expect(404);
          await post(who, `groups/${invented}/invitations`, { userIds: [b.id] }).expect(404);
          await get(who, `groups/${invented}/invitations`).expect(404);
        }
        // Not through the routes of a private conversation or a room either.
        await get(who, `conversations/${id}`).expect(404);
        await get(who, `conversations/${id}/messages`).expect(404);
        await roomMessages(who, id).expect((res) => expect([403, 404]).toContain(res.status));
        expect((await roomMessages(who, id)).body.items).toBeUndefined();
        // Nor by acting on one of its messages, or searching.
        await patch(who, `messages/${sent.id}`, { body: 'Changed' }).expect(404);
        await del(who, `messages/${sent.id}`).expect(404);
        await post(who, `messages/${sent.id}/hide`).expect(404);
        await post(who, `messages/${sent.id}/forward`, { conversationId: id }).expect(404);
        await h
          .http()
          .put(`/api/v1/chat/messages/${sent.id}/reactions/like`)
          .set(bearer(who.token))
          .expect(404);
        await get(who, `search?q=group&conversationId=${id}`).expect(404);
        if (who !== staff()) {
          const found = (await get(who, 'search?q=Only%20for%20the%20group').expect(200)).body;
          expect(found.items).toEqual([]);
          expect(JSON.stringify((await list(who).expect(200)).body)).not.toContain(id);
        }
      }
      // The people in it read it.
      const page = (await get(b, `groups/${id}/messages`).expect(200)).body;
      expect(page.items.map((m: { body: string }) => m.body)).toEqual(['Only for the group']);
      expect(page.items[0].sender.id).toBe(a.id);
    });

    it('a membership that ends changes nothing in a group: the person keeps the platform', async () => {
      const { id, a, b } = await groupOf();
      await groupSend(a, id, 'Before').expect(201);
      await endMembership(b, 'expire');
      expect((await get(b, `groups/${id}`).expect(200)).body.sendState).toBe('none');
      await groupSend(b, id, 'Still here').expect(201);
    });

    it('someone who is no longer verified reads their groups and can’t write', async () => {
      const { id, a, b } = await groupOf();
      await groupSend(a, id, 'Before').expect(201);
      await unverify(b);
      expect((await get(b, `groups/${id}`).expect(200)).body.sendState).toBe('membersOnly');
      expect((await get(b, `groups/${id}/messages`).expect(200)).body.items).toHaveLength(1);
      expect(code(await groupSend(b, id, 'After').expect(403))).toBe('membersOnly');
      await makeGroup(b).expect(403);
    });
  });

  describe('groups', () => {
    it('are made by an active member with a name, and appear in the list of conversations', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const created = (await makeGroup(a, [b.id], 'Journal club').expect(201)).body;
      expect(created).toMatchObject({
        name: 'Journal club',
        memberCount: 1,
        role: 'ADMIN',
        sendState: 'none',
        unreadCount: 0,
      });
      // In the maker's list from the start, with no message yet; not in the invited person's.
      const mine = (await list(a).expect(200)).body.items;
      expect(mine).toContainEqual(
        expect.objectContaining({
          id: created.id,
          kind: 'GROUP',
          group: { name: 'Journal club', memberCount: 1 },
        }),
      );
      expect((await list(b).expect(200)).body.items).toEqual([]);

      await accept(b, created.id);
      await groupSend(a, created.id, 'Welcome').expect(201);
      const forB = (await list(b).expect(200)).body.items[0];
      expect(forB).toMatchObject({ id: created.id, kind: 'GROUP', unreadCount: 1 });
      expect(forB.group.memberCount).toBe(2);
      expect(forB.other.id).toBeNull();
      expect(await unread(b)).toBe(1);
      await post(b, `groups/${created.id}/read`).expect(204);
      expect(await unread(b)).toBe(0);
      // Found by its name in the list's search.
      expect((await list(b, '?q=Journal').expect(200)).body.items).toHaveLength(1);

      // Bad input.
      await makeGroup(a, [], 'x').expect(400);
      await post(a, 'groups', { name: 'No list', userIds: ['nope'] }).expect(400);
      // The audit log says a group was made, not what it is called.
      const audit = await h.db.query<{ changes: object | null }>(
        `SELECT changes FROM audit_logs WHERE entity_id = $1 AND action = 'chat.group.create'`,
        [created.id],
      );
      expect(audit.rows).toHaveLength(1);
      expect(JSON.stringify(audit.rows[0])).not.toContain('Journal');
    });

    it('messages have replies, mentions and reactions, and keep HTML as plain text', async () => {
      const { id, a, b, c } = await groupOf();
      const outsider = await listed();
      const first = (await groupSend(a, id, '<b>Hello</b> group').expect(201)).body;
      expect(first.body).toBe('<b>Hello</b> group');
      const reply = (
        await groupSend(b, id, 'Hello back', { replyToId: first.id, mentions: [a.id] }).expect(201)
      ).body;
      expect(reply.replyTo.id).toBe(first.id);
      expect(reply.mentions.map((m: { id: string }) => m.id)).toEqual([a.id]);
      expect(
        code(await groupSend(b, id, 'Hi stranger', { mentions: [outsider.id] }).expect(400)),
      ).toBe('chatMentionNotInRoom');
      // A group has no announcements.
      await groupSend(a, id, 'Listen all', { announcement: true }).expect(403);
      await groupSend(a, id, '   ').expect(400);
      await h
        .http()
        .put(`/api/v1/chat/messages/${first.id}/reactions/heart`)
        .set(bearer(c.token))
        .expect(200);
      const seen = (await get(a, `groups/${id}/messages`).expect(200)).body.items[0];
      expect(seen.reactions).toEqual([{ reaction: 'heart', count: 1, mine: false }]);
      expect((await get(c, `groups/${id}`).expect(200)).body.unreadCount).toBe(2);
    });

    it('only the admin renames, removes and hands over; the longest-standing person takes over', async () => {
      const { id, a, b, c } = await groupOf();
      await patch(b, `groups/${id}`, { name: 'Taken' }).expect(403);
      await post(b, `groups/${id}/members/${c.id}/remove`).expect(403);
      await post(b, `groups/${id}/admin`, { userId: b.id }).expect(403);
      await post(b, `groups/${id}/invitations`, { userIds: [a.id] }).expect(403);
      expect((await patch(a, `groups/${id}`, { name: 'Renamed' }).expect(200)).body.name).toBe(
        'Renamed',
      );
      // The admin doesn't remove themselves; leaving is how they go.
      await post(a, `groups/${id}/members/${a.id}/remove`).expect(403);
      await post(a, `groups/${id}/admin`, { userId: NOBODY }).expect(404);

      expect((await post(a, `groups/${id}/admin`, { userId: c.id }).expect(200)).body.role).toBe(
        'MEMBER',
      );
      const roles = async () =>
        Object.fromEntries(
          (
            (await get(b, `groups/${id}/members`).expect(200)).body.items as {
              id: string;
              role: string;
            }[]
          ).map((p) => [p.id, p.role]),
        );
      expect(await roles()).toEqual({ [a.id]: 'MEMBER', [b.id]: 'MEMBER', [c.id]: 'ADMIN' });

      // The admin leaves: whoever has been in the group longest runs it.
      await post(c, `groups/${id}/leave`).expect(204);
      await get(c, `groups/${id}`).expect(404);
      expect(await roles()).toEqual({ [a.id]: 'ADMIN', [b.id]: 'MEMBER' });
      expect((await get(a, `groups/${id}`).expect(200)).body.memberCount).toBe(2);

      // Everyone leaves: the group is closed, and nobody waits to come into it.
      const late = await listed();
      await post(a, `groups/${id}/invitations`, { userIds: [late.id] }).expect(204);
      await post(a, `groups/${id}/leave`).expect(204);
      await post(b, `groups/${id}/leave`).expect(204);
      expect(await invitations(late)).toEqual([]);
      const row = await h.db.query<{ member_count: number }>(
        'SELECT member_count FROM conversations WHERE id = $1',
        [id],
      );
      expect(row.rows[0]!.member_count).toBe(0);
    });

    it('a message or a person in a group can be reported, with the messages around it', async () => {
      const { id, a, b } = await groupOf();
      await groupSend(a, id, 'Before it').expect(201);
      const bad = (await groupSend(b, id, 'An unwanted message').expect(201)).body;
      const categories = (await get(a, 'report-categories').expect(200)).body.items;
      const reported = (
        await post(a, 'reports', { messageId: bad.id, categoryId: categories[0].id }).expect(201)
      ).body;
      const report = (
        await h
          .http()
          .get(`/api/v1/admin/chat/reports/${reported.id}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      expect(report.messages.map((m: { body: string }) => m.body)).toEqual([
        'Before it',
        'An unwanted message',
      ]);
      // A report from a group names no room, and staff still can't open the group.
      expect(report.room).toBeNull();
      await get(staff(), `groups/${id}/messages`).expect(404);
    });
  });

  describe('invitations (exit criterion)', () => {
    it('give nothing until accepted; decline, withdraw and expiry close them', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const c = await listed('Carmel');
      const d = await listed('Dor');
      const id = (await makeGroup(a, [b.id, c.id, d.id], 'By invitation').expect(201)).body
        .id as string;
      await groupSend(a, id, 'Written before anyone came').expect(201);

      const forB = await invitationTo(b, id);
      expect(forB).toMatchObject({ kind: 'GROUP', name: 'By invitation', memberCount: 1 });
      expect(forB.invitedBy.id).toBe(a.id);
      // The invited person is told who is in the group, and nothing that was written.
      expect(forB.members.map((m) => m.id)).toEqual([a.id]);
      expect(JSON.stringify(forB)).not.toContain('Written before');
      await get(b, `groups/${id}/messages`).expect(404);
      // The group's people don't see them as one of them either.
      expect((await get(a, `groups/${id}/members`).expect(200)).body.items).toHaveLength(1);
      expect(
        (await get(a, `groups/${id}/invitations`).expect(200)).body.items.map(
          (i: { user: { id: string } }) => i.user.id,
        ),
      ).toEqual(expect.arrayContaining([b.id, c.id, d.id]));

      // A notice under the bell, under "Private messages".
      const notice = await h.db.query<{ type: string; kind: string; link: string }>(
        `SELECT type, kind::text AS kind, link FROM notifications WHERE user_id = $1`,
        [b.id],
      );
      expect(notice.rows).toEqual([
        { type: 'chatGroupInvitation', kind: 'MESSAGES', link: '/chat/invitations' },
      ]);

      // Accepted: in, and reading from here on, with nothing counted as unread.
      const answer = (await post(b, `invitations/${forB.id}/accept`).expect(200)).body;
      expect(answer).toEqual({ kind: 'GROUP', conversationId: id });
      expect((await get(b, `groups/${id}`).expect(200)).body).toMatchObject({
        role: 'MEMBER',
        memberCount: 2,
        unreadCount: 0,
      });
      // An invitation is used once, and only by the person it is for.
      await post(b, `invitations/${forB.id}/accept`).expect(404);
      const forC = await invitationTo(c, id);
      await post(d, `invitations/${forC.id}/accept`).expect(404);
      await post(d, `invitations/${forC.id}/decline`).expect(404);
      await del(d, `invitations/${forC.id}`).expect(404);

      // Declined: gone, and the group stays closed to them.
      await post(c, `invitations/${forC.id}/decline`).expect(204);
      expect(await invitations(c)).toEqual([]);
      await get(c, `groups/${id}`).expect(404);
      await post(c, `invitations/${forC.id}/accept`).expect(404);

      // Withdrawn by the admin (not by another member of the group).
      const forD = await invitationTo(d, id);
      await del(b, `invitations/${forD.id}`).expect(403);
      await del(a, `invitations/${forD.id}`).expect(204);
      expect(await invitations(d)).toEqual([]);
      await post(d, `invitations/${forD.id}/accept`).expect(404);

      // Inviting again makes a new invitation; one that ran out is no invitation.
      await post(a, `groups/${id}/invitations`, { userIds: [c.id, d.id] }).expect(204);
      // Inviting someone already invited, or already in, changes nothing.
      await post(a, `groups/${id}/invitations`, { userIds: [c.id, b.id] }).expect(204);
      expect(await invitations(c)).toHaveLength(1);
      await h.db.query(
        `UPDATE conversation_invitations SET expires_at = now() - interval '1 minute'
         WHERE conversation_id = $1 AND user_id = $2 AND status = 'OPEN'`,
        [id, c.id],
      );
      expect(await invitations(c)).toEqual([]);
      const expired = await h.db.query<{ id: string }>(
        `SELECT id FROM conversation_invitations WHERE conversation_id = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [id, c.id],
      );
      await post(c, `invitations/${expired.rows[0]!.id}/accept`).expect(404);
    });

    it('someone who can’t be invited looks like someone who doesn’t exist', async () => {
      const a = await listed('Avi');
      const unlisted = await member('Uri');
      const nobody = await listed('Noga');
      await chatSettings(nobody, { ...SETTINGS, invitesFrom: 'NOBODY' }).expect(200);
      const contactsOnly = await listed('Carmel');
      await chatSettings(contactsOnly, { ...SETTINGS, invitesFrom: 'CONTACTS' }).expect(200);
      const blocker = await listed('Bella');
      await block(blocker, a.id).expect(204);
      const blockedByMe = await listed('Dor');
      await block(a, blockedByMe.id).expect(204);
      const ended = await listed('Eli');
      const id = (await makeGroup(a).expect(201)).body.id as string;

      for (const target of [unlisted, nobody, contactsOnly, blocker, blockedByMe]) {
        await post(a, `groups/${id}/invitations`, { userIds: [target.id] }).expect(404);
        // Making a group with them is refused whole: no half-invited group is left behind.
        await makeGroup(a, [target.id]).expect(404);
        expect(await invitations(target)).toEqual([]);
      }
      await post(a, `groups/${id}/invitations`, { userIds: [NOBODY] }).expect(404);
      await post(a, `groups/${id}/invitations`, { userIds: [a.id] }).expect(204);
      // The search for someone to invite doesn't find them either.
      for (const target of [unlisted, nobody, contactsOnly, blocker, blockedByMe]) {
        const email = await h.db.query<{ last_name: string }>(
          'SELECT last_name FROM profiles WHERE user_id = $1',
          [target.id],
        );
        const q = encodeURIComponent(email.rows[0]!.last_name);
        expect((await get(a, `invitable?q=${q}`).expect(200)).body.items).toEqual([]);
      }

      // "Only people I talk with": a conversation with a message makes them a contact.
      const conversationId = (await start(a, contactsOnly.id).expect(201)).body.id as string;
      await send(a, conversationId, 'Hello').expect(201);
      await post(a, `groups/${id}/invitations`, { userIds: [contactsOnly.id] }).expect(204);
      expect(await invitations(contactsOnly)).toHaveLength(1);

      // A person who is no longer verified can be invited and can't accept.
      await post(a, `groups/${id}/invitations`, { userIds: [ended.id] }).expect(204);
      await unverify(ended);
      const waiting = await invitationTo(ended, id);
      expect(code(await post(ended, `invitations/${waiting.id}/accept`).expect(403))).toBe(
        'membersOnly',
      );

      // Blocking the inviter declines what they sent.
      const annoyed = await listed('Gal');
      await post(a, `groups/${id}/invitations`, { userIds: [annoyed.id] }).expect(204);
      await block(annoyed, a.id).expect(204);
      expect(await invitations(annoyed)).toEqual([]);
    });

    it('a group never holds more than fifty, whoever accepts at the same moment', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const c = await listed('Carmel');
      const d = await listed('Dor');
      const id = (await makeGroup(a, [b.id, c.id, d.id]).expect(201)).body.id as string;
      // As if forty-eight more people were already in it: one place is left.
      await h.db.query('UPDATE conversations SET member_count = 49 WHERE id = $1', [id]);
      const ids = await Promise.all([b, c, d].map(async (p) => (await invitationTo(p, id)).id));
      const answers = await Promise.all(
        [b, c, d].map((p, index) => post(p, `invitations/${ids[index]}/accept`)),
      );
      expect(answers.map((res) => res.status).sort()).toEqual([200, 422, 422]);
      expect(answers.filter((res) => res.status === 422).map(code)).toEqual([
        'chatGroupFull',
        'chatGroupFull',
      ]);
      const row = await h.db.query<{ member_count: number; members: string }>(
        `SELECT c.member_count,
                (SELECT count(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS members
         FROM conversations c WHERE c.id = $1`,
        [id],
      );
      expect(row.rows[0]).toEqual({ member_count: 50, members: '2' });
      // Someone refused keeps their invitation for when there is room.
      const refused = [b, c, d][answers.findIndex((res) => res.status === 422)]!;
      expect(await invitations(refused)).toHaveLength(1);
      // And no more people are invited into a full group.
      const late = await listed();
      expect(
        code(await post(a, `groups/${id}/invitations`, { userIds: [late.id] }).expect(422)),
      ).toBe('chatGroupFull');
    });
  });

  describe('rooms by invitation (exit criterion)', () => {
    it('don’t exist for a member who was not invited, and are joined only by accepting', async () => {
      const name = `Closed ${tag()}`;
      const id = await createRoom({ inviteOnly: true, nameEn: name });
      const mod = await member('Mod');
      await makeModerator(id, mod);
      const sent = (await roomSend(mod, id, 'For the invited only').expect(201)).body;
      const guest = await member('Guest');
      const other = await member('Other');

      const browse = async (as: Person) =>
        (await get(as, `rooms?q=${encodeURIComponent(name)}`).expect(200)).body.items;
      for (const who of [guest, other]) {
        expect(await browse(who)).toEqual([]);
        await room(who, id).expect(404);
        await join(who, id).expect(404);
        await roomMessages(who, id).expect(404);
        await get(who, `rooms/${id}/members`).expect(404);
        await get(who, `rooms/${id}/pins`).expect(404);
        await roomSend(who, id, 'Hello?').expect(404);
        await post(who, `rooms/${id}/read`).expect(404);
        await post(who, `rooms/${id}/invitations`, { userIds: [mod.id] }).expect(404);
        await get(who, `rooms/${id}/invitations`).expect(404);
        const categories = (await get(who, 'report-categories').expect(200)).body.items;
        await post(who, 'reports', { roomId: id, categoryId: categories[0].id }).expect(404);
        await post(who, `messages/${sent.id}/hide`).expect(404);
      }
      // The moderator and staff see it.
      expect((await room(mod, id).expect(200)).body.inviteOnly).toBe(true);
      await room(staff(), id).expect(200);

      // The moderator invites; until the guest accepts, the room still doesn't exist for them.
      await post(mod, `rooms/${id}/invitations`, { userIds: [guest.id] }).expect(204);
      const invitation = await invitationTo(guest, id);
      expect(invitation).toMatchObject({ kind: 'ROOM', memberCount: 1, members: [] });
      await room(guest, id).expect(404);
      await roomMessages(guest, id).expect(404);
      const notice = await h.db.query<{ type: string; kind: string }>(
        `SELECT type, kind::text AS kind FROM notifications WHERE user_id = $1`,
        [guest.id],
      );
      expect(notice.rows).toEqual([{ type: 'chatRoomInvitation', kind: 'ROOMS' }]);

      await post(guest, `invitations/${invitation.id}/accept`).expect(200);
      expect((await room(guest, id).expect(200)).body).toMatchObject({
        role: 'MEMBER',
        memberCount: 2,
      });
      expect((await roomMessages(guest, id).expect(200)).body.items).toHaveLength(1);
      // In their own list of rooms; still not in anyone's "Browse rooms".
      expect(
        (await get(guest, 'rooms/mine').expect(200)).body.items.map((r: { id: string }) => r.id),
      ).toContain(id);
      expect(await browse(guest)).toEqual([]);
      expect(await browse(other)).toEqual([]);

      // An ordinary person in the room doesn't invite; staff do.
      await post(guest, `rooms/${id}/invitations`, { userIds: [other.id] }).expect(403);
      await post(staff(), `rooms/${id}/invitations`, { userIds: [other.id] }).expect(204);
      // Someone who left needs a new invitation to come back.
      await post(guest, `rooms/${id}/leave`).expect(204);
      await room(guest, id).expect(404);
      await join(guest, id).expect(404);
    });

    it('an open room needs no invitation, and a banned person is not invited', async () => {
      const open = await createRoom();
      const mod = await member('Mod');
      await makeModerator(open, mod);
      const guest = await member('Guest');
      expect(
        code(await post(mod, `rooms/${open}/invitations`, { userIds: [guest.id] }).expect(422)),
      ).toBe('chatRoomNotInviteOnly');

      const closed = await createRoom({ inviteOnly: true });
      await makeModerator(closed, mod);
      await post(mod, `rooms/${closed}/bans`, {
        userId: guest.id,
        reason: 'A test ban',
        days: 1,
      }).expect(201);
      await post(mod, `rooms/${closed}/invitations`, { userIds: [guest.id] }).expect(404);
      // Staff make an open room closed: the people in it stay, and it leaves the list.
      const a = await member('Avi');
      await join(a, open).expect(200);
      const current = (
        await h
          .http()
          .get(`/api/v1/admin/chat/rooms/${open}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      await h
        .http()
        .put(`/api/v1/admin/chat/rooms/${open}`)
        .set(bearer(admin.accessToken))
        .send({ nameHe: current.nameHe, inviteOnly: true })
        .expect(200);
      await room(a, open).expect(200);
      await room(guest, open).expect(404);
    });
  });

  describe('activity (exit criterion)', () => {
    const activityOf = async (as: Person, ...ids: string[]) =>
      (await get(as, `activity?userIds=${ids.join(',')}`).expect(200)).body.items as {
        userId: string;
        activity: string;
      }[];

    it('is shown only to the people a person talks with, and never against their switch', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const stranger = await listed('Sara');
      const conversationId = (await start(a, b.id).expect(201)).body.id as string;
      // An empty conversation is not yet "talking with".
      const first = await listen(b);
      try {
        expect(await activityOf(a, b.id)).toEqual([]);
        await send(a, conversationId, 'Hello').expect(201);
        expect(await activityOf(a, b.id)).toEqual([{ userId: b.id, activity: 'online' }]);
        // A stranger learns nothing, and nothing about people who don't exist.
        expect(await activityOf(stranger, b.id, a.id, NOBODY)).toEqual([]);
        expect(await activityOf(a, NOBODY, stranger.id)).toEqual([]);
      } finally {
        first.stop();
      }
      // The page closed: "today", never a time.
      await until(async () => (await activityOf(a, b.id))[0]?.activity === 'today');
      expect(await activityOf(a, b.id)).toEqual([{ userId: b.id, activity: 'today' }]);
      await h.db.query(
        `UPDATE chat_preferences SET last_active_at = now() - interval '3 days' WHERE user_id = $1`,
        [b.id],
      );
      expect((await activityOf(a, b.id))[0]!.activity).toBe('week');
      await h.db.query(
        `UPDATE chat_preferences SET last_active_at = now() - interval '30 days' WHERE user_id = $1`,
        [b.id],
      );
      expect((await activityOf(a, b.id))[0]!.activity).toBe('earlier');

      // Bella switches it off: nothing about her, online or not, and no event when she comes.
      await chatSettings(b, { ...SETTINGS, showActivity: false }).expect(200);
      const forA = await listen(a);
      const second = await listen(b);
      try {
        await settle();
        expect(await activityOf(a, b.id)).toEqual([]);
        expect(forA.events.filter((e) => e.type === 'activity')).toEqual([]);
        // And she doesn't see others' either.
        expect(await activityOf(b, a.id)).toEqual([]);
      } finally {
        second.stop();
      }
      await settle();
      expect(forA.events.filter((e) => e.type === 'activity')).toEqual([]);

      // Switched back on: Avi is told when she comes and goes, and strangers are not.
      await chatSettings(b, { ...SETTINGS, showActivity: true }).expect(200);
      const forStranger = await listen(stranger);
      const third = await listen(b);
      try {
        await until(() => forA.events.some((e) => e.type === 'activity'));
        expect(forA.events).toContainEqual({ type: 'activity', userId: b.id });
        expect(forStranger.events.filter((e) => e.type === 'activity')).toEqual([]);
      } finally {
        third.stop();
        forA.stop();
        forStranger.stop();
      }
      await get(a, 'activity').expect(400);
      await get(a, 'activity?userIds=nope').expect(400);
    });

    it('people in the same group see each other; people in the same room don’t', async () => {
      const { a, b } = await groupOf();
      const open = await listen(b);
      try {
        expect(await activityOf(a, b.id)).toEqual([{ userId: b.id, activity: 'online' }]);
      } finally {
        open.stop();
      }
      const roomId = await createRoom();
      const x = await member('Xan');
      const y = await member('Yael');
      await join(x, roomId).expect(200);
      await join(y, roomId).expect(200);
      const there = await listen(y);
      try {
        expect(await activityOf(x, y.id)).toEqual([]);
      } finally {
        there.stop();
      }
    });
  });

  describe('forwarding, pinned conversations and finding a message', () => {
    it('forwards a copy that doesn’t say whose it was, only where the sender may write', async () => {
      const { id: groupId, a, b } = await groupOf();
      const outsider = await listed('Omer');
      const privateId = (await start(a, outsider.id).expect(201)).body.id as string;
      const original = (
        await groupSend(b, groupId, 'Worth passing on', { mentions: [a.id] }).expect(201)
      ).body;
      const copy = (
        await post(a, `messages/${original.id}/forward`, { conversationId: privateId }).expect(201)
      ).body;
      expect(copy).toMatchObject({
        conversationId: privateId,
        body: 'Worth passing on',
        forwarded: true,
        mine: true,
        mentions: [],
        replyTo: null,
      });
      expect(copy.sender.id).toBe(a.id);
      // The person it was forwarded to learns nothing of the group or of who wrote it.
      const seen = (await get(outsider, `conversations/${privateId}/messages`).expect(200)).body;
      expect(JSON.stringify(seen)).not.toContain(b.id);
      expect(JSON.stringify(seen)).not.toContain(groupId);

      // Into a room and into a group too.
      const roomId = await createRoom();
      await join(a, roomId).expect(200);
      expect(
        (await post(a, `messages/${original.id}/forward`, { conversationId: roomId }).expect(201))
          .body.forwarded,
      ).toBe(true);
      await post(a, `messages/${copy.id}/forward`, { conversationId: groupId }).expect(201);

      // Not a message the sender can't read, not to a place they are not in, not a deleted one.
      await post(outsider, `messages/${original.id}/forward`, {
        conversationId: privateId,
      }).expect(404);
      await post(a, `messages/${original.id}/forward`, { conversationId: NOBODY }).expect(404);
      const elsewhere = (await makeGroup(outsider).expect(201)).body.id as string;
      await post(a, `messages/${original.id}/forward`, { conversationId: elsewhere }).expect(404);
      // Not into a room where only moderators write.
      const quiet = await createRoom({ moderatorsOnly: true });
      await join(a, quiet).expect(200);
      await post(a, `messages/${original.id}/forward`, { conversationId: quiet }).expect(403);
      await del(b, `messages/${original.id}`).expect(204);
      expect(
        code(
          await post(a, `messages/${original.id}/forward`, { conversationId: privateId }).expect(
            422,
          ),
        ),
      ).toBe('chatMessageDeleted');
    });

    it('pins up to five conversations to the top of a person’s own list', async () => {
      const a = await listed('Avi');
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        ids.push((await makeGroup(a, [], `Pinned ${i} ${tag()}`).expect(201)).body.id as string);
      }
      // Newest activity first, to begin with.
      const order = async () =>
        ((await list(a).expect(200)).body.items as { id: string }[]).map((item) => item.id);
      expect(await order()).toEqual([...ids].reverse());
      await patch(a, `groups/${ids[0]}/me`, { pinned: true }).expect(200);
      await patch(a, `groups/${ids[2]}/me`, { pinned: true }).expect(200);
      // Pinned ones lead, the newest pin first; the rest follow as before.
      expect(await order()).toEqual([ids[2], ids[0], ids[5], ids[4], ids[3], ids[1]]);
      expect((await list(a).expect(200)).body.items[0].pinned).toBe(true);
      // The pages after the first don't repeat them.
      const firstPage = (await list(a, '?limit=2').expect(200)).body;
      expect(firstPage.items.map((i: { id: string }) => i.id)).toEqual([
        ids[2],
        ids[0],
        ids[5],
        ids[4],
      ]);
      const next = (
        await list(a, `?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`).expect(200)
      ).body;
      expect(next.items.map((i: { id: string }) => i.id)).toEqual([ids[3], ids[1]]);

      for (const id of [ids[1], ids[3], ids[4]]) {
        await patch(a, `groups/${id}/me`, { pinned: true }).expect(200);
      }
      expect(code(await patch(a, `groups/${ids[5]}/me`, { pinned: true }).expect(422))).toBe(
        'chatPinnedLimit',
      );
      // Pinning what is pinned changes nothing; unpinning makes room.
      await patch(a, `groups/${ids[0]}/me`, { pinned: true }).expect(200);
      await patch(a, `groups/${ids[0]}/me`, { pinned: false }).expect(200);
      await patch(a, `groups/${ids[5]}/me`, { pinned: true }).expect(200);

      // A private conversation and a room are pinned the same way, within the same five.
      const b = await listed('Bella');
      const privateId = (await start(a, b.id).expect(201)).body.id as string;
      await send(a, privateId, 'Hello').expect(201);
      expect(
        code(await patch(a, `conversations/${privateId}/me`, { pinned: true }).expect(422)),
      ).toBe('chatPinnedLimit');
      await patch(a, `groups/${ids[5]}/me`, { pinned: false }).expect(200);
      expect(
        (await patch(a, `conversations/${privateId}/me`, { pinned: true }).expect(200)).body.pinned,
      ).toBe(true);
      await patch(a, `conversations/${privateId}/me`, { pinned: false }).expect(200);
      const roomId = await createRoom();
      await join(a, roomId).expect(200);
      expect((await patch(a, `rooms/${roomId}/me`, { pinned: true }).expect(200)).body.pinned).toBe(
        true,
      );
      expect((await get(a, 'rooms/mine').expect(200)).body.items[0]).toMatchObject({
        id: roomId,
        pinned: true,
      });
    });

    it('finds messages by sender and by day, and opens a message in its place', async () => {
      const { id, a, b } = await groupOf();
      const word = `needle${tag()}`;
      for (let i = 1; i <= 30; i++) {
        await h.db.query('SELECT 1'); // keeps the order of the messages below strict
        await groupSend(i % 2 ? a : b, id, i === 12 ? `The ${word} is here` : `Filler ${i}`).expect(
          201,
        );
      }
      await groupSend(a, id, `Another ${word} from Avi`).expect(201);
      const search = async (extra: string) =>
        (
          (await get(a, `search?q=${word}&conversationId=${id}${extra}`).expect(200)).body
            .items as {
            message: { body: string; seq: number; senderId: string };
            group: { id: string; name: string } | null;
          }[]
        ).map((item) => item.message.body);
      expect(await search('')).toEqual([`Another ${word} from Avi`, `The ${word} is here`]);
      expect(await search(`&senderId=${b.id}`)).toEqual([`The ${word} is here`]);
      expect(await search(`&senderId=${a.id}`)).toEqual([`Another ${word} from Avi`]);
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect(await search(`&from=${today}`)).toHaveLength(2);
      expect(await search(`&from=${tomorrow}`)).toEqual([]);
      expect(await search(`&to=2020-01-01`)).toEqual([]);
      await get(a, `search?q=${word}&from=yesterday`).expect(400);
      const found = (await get(a, `search?q=${word}`).expect(200)).body.items[0];
      expect(found.group.id).toBe(id);
      expect(found.room).toBeNull();

      // Around the twelfth message: the ones just before it and from it on.
      const around = (await get(a, `groups/${id}/messages?around=12&limit=6`).expect(200)).body;
      expect(around.items.map((m: { seq: number }) => m.seq)).toEqual([9, 10, 11, 12, 13, 14]);
      expect(around.hasMore).toBe(true);
      const start = (await get(a, `groups/${id}/messages?around=2&limit=6`).expect(200)).body;
      expect(start.items.map((m: { seq: number }) => m.seq)).toEqual([1, 2, 3, 4]);
      expect(start.hasMore).toBe(false);
      await get(a, `groups/${id}/messages?around=3&before=9`).expect(400);
    });
  });

  describe('files in messages (exit criterion)', () => {
    let png: Buffer;
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    /** The start of an MP4 file: enough to be told as one. */
    const mp4 = (bytes = 2048) =>
      Buffer.concat([
        Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]),
        Buffer.from('isomiso2', 'ascii'),
        Buffer.alloc(bytes, 7),
      ]);
    const upload = (as: Person, body: Buffer, name: string) =>
      h.http().post('/api/v1/chat/attachments').set(bearer(as.token)).attach('file', body, name);
    const url = (as: Person, fileId: string, v = 'full') =>
      h.http().get(`/api/v1/files/${fileId}/url?v=${v}`).set(bearer(as.token));

    beforeAll(async () => {
      png = await sharp({
        create: { width: 40, height: 30, channels: 3, background: { r: 20, g: 90, b: 160 } },
      })
        .png()
        .toBuffer();
    });

    it('a picture, a PDF and a video are sent with a message and read only by its readers', async () => {
      const { id, a, b, c } = await groupOf();
      const outsider = await listed('Omer');
      const picture = (await upload(a, png, 'תמונה.png').expect(201)).body;
      expect(picture).toMatchObject({ kind: 'IMAGE', mimeType: 'image/png', width: 40 });
      expect(picture.originalName).toBe('תמונה.png');
      const document = (await upload(a, PDF, 'paper.pdf').expect(201)).body;
      const video = (await upload(a, mp4(), 'clip.mp4').expect(201)).body;
      expect(video).toMatchObject({
        kind: 'VIDEO',
        mimeType: 'video/mp4',
        originalName: 'clip.mp4',
      });

      // Not sent yet: its uploader's alone.
      await url(a, picture.id).expect(200);
      await url(b, picture.id).expect(404);
      await url(staff(), picture.id).expect(404);

      // A message may be files without a text.
      const sent = (
        await groupSend(a, id, '', { attachmentIds: [picture.id, document.id, video.id] }).expect(
          201,
        )
      ).body;
      expect(sent.body).toBe('');
      expect(sent.attachments.map((f: { id: string; kind: string }) => [f.id, f.kind])).toEqual([
        [picture.id, 'IMAGE'],
        [document.id, 'DOCUMENT'],
        [video.id, 'VIDEO'],
      ]);
      expect((await list(b).expect(200)).body.items[0].lastMessage.files).toBe(3);

      // The people of the group read them; nobody else does, staff included.
      for (const file of [picture, document, video]) {
        await url(b, file.id).expect(200);
        await url(c, file.id).expect(200);
        await url(outsider, file.id).expect(404);
        await url(staff(), file.id).expect(404);
        await h.http().get(`/api/v1/files/${file.id}/url`).expect(404);
      }
      await url(b, picture.id, 'thumb').expect(200);
      await url(outsider, picture.id, 'thumb').expect(404);

      // The video is served in parts, as a player asks for it; the picture inline; the PDF as
      // a download.
      const link = (await url(b, video.id).expect(200)).body.url as string;
      const whole = await h.http().get(link).expect(200);
      expect(whole.headers['content-type']).toBe('video/mp4');
      expect(whole.headers['accept-ranges']).toBe('bytes');
      expect(whole.headers['content-disposition']).toContain('inline');
      const size = Number(whole.headers['content-length']);
      expect(size).toBe(mp4().length);
      const part = await h.http().get(link).set('Range', 'bytes=10-109').expect(206);
      expect(part.headers['content-range']).toBe(`bytes 10-109/${size}`);
      expect(part.headers['content-length']).toBe('100');
      const tail = await h.http().get(link).set('Range', 'bytes=-50').expect(206);
      expect(tail.headers['content-range']).toBe(`bytes ${size - 50}-${size - 1}/${size}`);
      const pdfLink = (await url(b, document.id).expect(200)).body.url as string;
      expect((await h.http().get(pdfLink).expect(200)).headers['content-disposition']).toContain(
        'attachment',
      );
      // A link can't be changed into a link to another file.
      await h.http().get(link.replace(video.id, document.id)).expect(404);

      // Someone who left no longer reads them, even if they sent them.
      const leaver = (await upload(c, png, 'mine.png').expect(201)).body;
      await groupSend(c, id, 'My picture', { attachmentIds: [leaver.id] }).expect(201);
      await post(c, `groups/${id}/leave`).expect(204);
      await url(c, leaver.id).expect(404);
      await url(c, picture.id).expect(404);
      await url(b, leaver.id).expect(200);

      // Deleting the message for everyone erases its files.
      await del(a, `messages/${sent.id}`).expect(204);
      for (const file of [picture, document, video]) {
        await url(a, file.id).expect(404);
        await url(b, file.id).expect(404);
      }
      await h.http().get(link).expect(404);
      const left = await h.db.query('SELECT id FROM files WHERE id = ANY($1::uuid[])', [
        [picture.id, document.id, video.id],
      ]);
      expect(left.rows).toEqual([]);
      expect((await get(b, `groups/${id}/messages`).expect(200)).body.items[0].attachments).toEqual(
        [],
      );
    });

    it('only allowed files, used once, by the person who uploaded them', async () => {
      const { id, a, b } = await groupOf();
      const reject = async (body: Buffer, name: string) =>
        (await upload(a, body, name).expect(400)).body.error.details[0].code;
      expect(await reject(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'a.svg')).toBe(
        'fileTypeNotAllowed',
      );
      expect(await reject(Buffer.from('<html><script>alert(1)</script></html>'), 'a.pdf')).toBe(
        'fileTypeNotAllowed',
      );
      expect(await reject(Buffer.from('just text'), 'clip.mp4')).toBe('fileTypeNotAllowed');
      expect(await reject(Buffer.alloc(0), 'empty.png')).toBe('fileEmpty');
      // A PDF over ten megabytes; a video may be larger, up to a hundred.
      const bigPdf = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
      expect(await reject(bigPdf, 'big.pdf')).toBe('fileTooLarge');
      const bigVideo = (await upload(a, mp4(12 * 1024 * 1024), 'long.mp4').expect(201)).body;
      expect(bigVideo.sizeBytes).toBeGreaterThan(12 * 1024 * 1024);
      await h.http().post('/api/v1/chat/attachments').attach('file', png, 'a.png').expect(401);
      await h.http().post('/api/v1/chat/attachments').set(bearer(a.token)).expect(400);
      // Nothing is left behind in the temporary folder's place in the database for a refusal.
      const outsider = await member();
      await unverify(outsider);
      await upload(outsider, png, 'a.png').expect(403);

      const one = (await upload(a, png, 'one.png').expect(201)).body;
      const invalid = async (as: Person, ids: string[]) =>
        code(await groupSend(as, id, 'With files', { attachmentIds: ids }).expect(400));
      // Someone else's upload, an invented id, and a file of another kind of upload.
      expect(await invalid(b, [one.id])).toBe('chatAttachmentInvalid');
      expect(await invalid(a, [NOBODY])).toBe('chatAttachmentInvalid');
      await groupSend(a, id, 'First use', { attachmentIds: [one.id] }).expect(201);
      // Used once.
      expect(await invalid(a, [one.id])).toBe('chatAttachmentInvalid');
      // One video at most, three files at most.
      const second = (await upload(a, mp4(), 'second.mp4').expect(201)).body;
      expect(await invalid(a, [bigVideo.id, second.id])).toBe('chatAttachmentInvalid');
      const four = [];
      for (let i = 0; i < 4; i++)
        four.push((await upload(a, png, `p${i}.png`).expect(201)).body.id);
      await groupSend(a, id, 'Too many', { attachmentIds: four }).expect(400);
      // Neither a text nor a file is no message.
      await groupSend(a, id, '', { attachmentIds: [] }).expect(400);
      // A picture is stored re-made: the bytes kept are not the bytes sent.
      const stored = await h.db.query<{ sha256: string; scan_status: string; purpose: string }>(
        'SELECT sha256, scan_status::text, purpose::text FROM files WHERE id = $1',
        [one.id],
      );
      expect(stored.rows[0]!.purpose).toBe('CHAT');
    });

    it('work in private conversations and rooms, and travel with a forwarded message', async () => {
      const a = await listed('Avi');
      const b = await listed('Bella');
      const third = await listed('Tal');
      const privateId = (await start(a, b.id).expect(201)).body.id as string;
      const picture = (await upload(a, png, 'p.png').expect(201)).body;
      const sent = (
        await send(a, privateId, 'See this', { attachmentIds: [picture.id] }).expect(201)
      ).body;
      expect(sent.attachments).toHaveLength(1);
      await url(b, picture.id).expect(200);
      await url(third, picture.id).expect(404);
      await url(staff(), picture.id).expect(404);

      // Forwarded to a room: the same file, now also for the people of the room and for staff
      // (who may read any room).
      const roomId = await createRoom();
      await join(b, roomId).expect(200);
      await join(third, roomId).expect(200);
      const copy = (
        await post(b, `messages/${sent.id}/forward`, { conversationId: roomId }).expect(201)
      ).body;
      expect(copy.forwarded).toBe(true);
      expect(copy.attachments.map((f: { id: string }) => f.id)).toEqual([picture.id]);
      await url(third, picture.id).expect(200);
      await url(staff(), picture.id).expect(200);

      // The original is deleted: the copy keeps the file, and the private side loses it.
      await del(a, `messages/${sent.id}`).expect(204);
      await url(third, picture.id).expect(200);
      expect(
        (await roomMessages(third, roomId).expect(200)).body.items[0].attachments,
      ).toHaveLength(1);
      // A moderator removes the copy: now the file is gone for everyone.
      const mod = await member('Mod');
      await makeModerator(roomId, mod);
      await del(mod, `rooms/${roomId}/messages/${copy.id}`).expect(204);
      await url(third, picture.id).expect(404);
      await url(b, picture.id).expect(404);
      const left = await h.db.query('SELECT id FROM files WHERE id = $1', [picture.id]);
      expect(left.rows).toEqual([]);

      // A report keeps how many files a message had, not the files.
      const again = (await upload(a, png, 'q.png').expect(201)).body;
      const reportedMessage = (
        await send(a, privateId, 'Reported', { attachmentIds: [again.id] }).expect(201)
      ).body;
      const categories = (await get(b, 'report-categories').expect(200)).body.items;
      const report = (
        await post(b, 'reports', {
          messageId: reportedMessage.id,
          categoryId: categories[0].id,
        }).expect(201)
      ).body;
      const seen = (
        await h
          .http()
          .get(`/api/v1/admin/chat/reports/${report.id}`)
          .set(bearer(admin.accessToken))
          .expect(200)
      ).body;
      expect(seen.messages.at(-1)).toMatchObject({ body: 'Reported', reported: true, files: 1 });
      expect(JSON.stringify(seen)).not.toContain(again.id);
      await url(staff(), again.id).expect(404);
    });
  });

  describe('live events', () => {
    it('reach the people of a group, tell the invited person, and stop for someone removed', async () => {
      const { id, a, b, c } = await groupOf();
      const guest = await listed('Guest');
      const [forB, forC, forGuest] = await Promise.all([listen(b), listen(c), listen(guest)]);
      try {
        const sent = (await groupSend(a, id, 'Live in a group').expect(201)).body;
        await until(() => forB.events.some((e) => e.type === 'message.new'));
        const expected = { type: 'message.new', conversationId: id, messageId: sent.id, seq: 1 };
        expect(forB.events).toContainEqual(expected);
        expect(forC.events).toContainEqual(expected);

        // An invitation tells the invited person, and nothing of the group reaches them.
        await post(a, `groups/${id}/invitations`, { userIds: [guest.id] }).expect(204);
        await until(() => forGuest.events.some((e) => e.type === 'invitation'));
        expect(forGuest.events).toContainEqual({ type: 'invitation' });
        await groupSend(a, id, 'Still not for the guest').expect(201);
        await settle();
        expect(forGuest.events.filter((e) => e.type === 'message.new')).toEqual([]);

        // Accepted: they hear the group from now on.
        await accept(guest, id);
        const next = (await groupSend(a, id, 'Welcome').expect(201)).body;
        await until(() => forGuest.events.some((e) => e.type === 'message.new'));
        expect(forGuest.events).toContainEqual({
          type: 'message.new',
          conversationId: id,
          messageId: next.id,
          seq: 3,
        });

        // Removed: told at once, and nothing after.
        await post(a, `groups/${id}/members/${c.id}/remove`).expect(204);
        await until(() => forC.events.some((e) => e.type === 'room.left'));
        expect(forC.events).toContainEqual({ type: 'room.left', conversationId: id });
        const before = forC.events.length;
        await groupSend(a, id, 'After Carmel left').expect(201);
        await settle();
        expect(forC.events.slice(before).filter((e) => e.type === 'message.new')).toEqual([]);
      } finally {
        forB.stop();
        forC.stop();
        forGuest.stop();
      }
    });
  });
});
