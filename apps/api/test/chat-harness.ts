import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
} from './auth-harness';

export interface ChatPerson {
  id: string;
  email: string;
  token: string;
  membershipId: string | null;
}

/** An id no account, conversation or message has. */
export const NOBODY = '0190a000-0000-7000-8000-00000000c0de';

/**
 * The people and calls the chat suites share. Everyone is fictional. The harness and the admin
 * are read when a helper runs, so the suite can create them in beforeAll.
 */
export function chatActors(harness: () => Harness, adminToken: () => string) {
  const run = Date.now().toString(36);
  let n = 0;
  let types: Record<string, string> | null = null;
  /** A name part no other test or run uses. */
  const tag = () => `zc${run}${(++n).toString(36)}x`;
  const h = harness;

  async function typeId(key: string): Promise<string> {
    if (!types) {
      const res = await h().http().get('/api/v1/membership-types').expect(200);
      types = Object.fromEntries(
        (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
      );
    }
    return types[key]!;
  }

  async function person(membershipType: string | null = null): Promise<ChatPerson> {
    const email = await createVerifiedUser(h(), 'chat');
    let membershipId: string | null = null;
    if (membershipType) {
      const created = await h()
        .http()
        .post('/api/v1/admin/memberships')
        .set(bearer(adminToken()))
        .send({ email, typeId: await typeId(membershipType) })
        .expect(201);
      membershipId = created.body.membership.id;
    }
    const { rows } = await h().db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { id: rows[0]!.id, email, token: (await signIn(h(), email)).accessToken, membershipId };
  }

  /** An active member with a name. Not listed in the directory. */
  async function member(first = 'Noa'): Promise<ChatPerson> {
    const p = await person('HONORARY_MEMBER');
    await h()
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(p.token))
      .send({ firstName: first, lastName: `Fictional ${tag()}` })
      .expect(200);
    return p;
  }

  const consent = (p: ChatPerson, granted: boolean) =>
    h()
      .http()
      .post('/api/v1/me/consents')
      .set(bearer(p.token))
      .send({ kind: 'DIRECTORY', granted })
      .expect(200);

  /** An active member who chose to be listed, so others may write to them. */
  async function listed(first = 'Dana'): Promise<ChatPerson> {
    const p = await member(first);
    await consent(p, true);
    return p;
  }

  const endMembership = (p: ChatPerson, how: 'suspend' | 'expire') =>
    h()
      .http()
      .post(`/api/v1/admin/memberships/${p.membershipId}/${how}`)
      .set(bearer(adminToken()))
      .send(how === 'suspend' ? { reason: 'Test' } : {})
      .expect(200);

  /**
   * The platform no longer knows the person as a physician. (A membership that ends does not
   * do this: the person keeps the platform. How verification is given and withdrawn is M17.)
   */
  const unverify = (p: ChatPerson) =>
    h().db.query('UPDATE users SET verified_at = NULL WHERE id = $1', [p.id]);

  const start = (from: ChatPerson, toId: string) =>
    h().http().post('/api/v1/chat/conversations').set(bearer(from.token)).send({ userId: toId });
  const send = (from: ChatPerson, id: string, body: string, extra: object = {}) =>
    h()
      .http()
      .post(`/api/v1/chat/conversations/${id}/messages`)
      .set(bearer(from.token))
      .send({ body, ...extra });
  const messages = (as: ChatPerson, id: string, query = '') =>
    h().http().get(`/api/v1/chat/conversations/${id}/messages${query}`).set(bearer(as.token));
  const conversation = (as: ChatPerson, id: string) =>
    h().http().get(`/api/v1/chat/conversations/${id}`).set(bearer(as.token));
  const list = (as: ChatPerson, query = '') =>
    h().http().get(`/api/v1/chat/conversations${query}`).set(bearer(as.token));
  const unread = async (as: ChatPerson) =>
    (await h().http().get('/api/v1/chat/unread-count').set(bearer(as.token)).expect(200)).body
      .conversations as number;
  const read = (as: ChatPerson, id: string, body: object = {}) =>
    h().http().post(`/api/v1/chat/conversations/${id}/read`).set(bearer(as.token)).send(body);
  const settings = (as: ChatPerson, id: string, body: object) =>
    h().http().patch(`/api/v1/chat/conversations/${id}/me`).set(bearer(as.token)).send(body);
  const block = (as: ChatPerson, userId: string) =>
    h().http().post('/api/v1/chat/blocks').set(bearer(as.token)).send({ userId });
  const unblock = (as: ChatPerson, userId: string) =>
    h().http().delete(`/api/v1/chat/blocks/${userId}`).set(bearer(as.token));
  const chatSettings = (as: ChatPerson, body: object) =>
    h().http().put('/api/v1/me/chat-settings').set(bearer(as.token)).send(body);
  const people = (as: ChatPerson, q: string) =>
    h()
      .http()
      .get(`/api/v1/chat/people?q=${encodeURIComponent(q)}`)
      .set(bearer(as.token));

  /** A and B (B listed) with an open conversation. */
  async function pair(): Promise<{ a: ChatPerson; b: ChatPerson; id: string }> {
    const a = await member();
    const b = await listed();
    const id = (await start(a, b.id).expect(201)).body.id as string;
    return { a, b, id };
  }

  const bodies = (res: { body: { items: { body: string }[] } }) =>
    res.body.items.map((item) => item.body);

  // --- Rooms (M12) ----------------------------------------------------------------------------

  const asAdmin = () => bearer(adminToken());
  /** A room opened by staff, with a name no other test or run uses. */
  async function createRoom(extra: object = {}): Promise<string> {
    const res = await h()
      .http()
      .post('/api/v1/admin/chat/rooms')
      .set(asAdmin())
      .send({ organisationId: DEFAULT_ORGANISATION, nameHe: `חדר ${tag()}`, ...extra })
      .expect(201);
    return res.body.id as string;
  }
  const room = (as: ChatPerson, id: string) =>
    h().http().get(`/api/v1/chat/rooms/${id}`).set(bearer(as.token));
  const join = (as: ChatPerson, id: string) =>
    h().http().post(`/api/v1/chat/rooms/${id}/join`).set(bearer(as.token));
  const leave = (as: ChatPerson, id: string) =>
    h().http().post(`/api/v1/chat/rooms/${id}/leave`).set(bearer(as.token));
  const roomSend = (from: ChatPerson, id: string, body: string, extra: object = {}) =>
    h()
      .http()
      .post(`/api/v1/chat/rooms/${id}/messages`)
      .set(bearer(from.token))
      .send({ body, ...extra });
  const roomMessages = (as: ChatPerson, id: string, query = '') =>
    h().http().get(`/api/v1/chat/rooms/${id}/messages${query}`).set(bearer(as.token));
  const makeModerator = (id: string, p: ChatPerson) =>
    h()
      .http()
      .post(`/api/v1/admin/chat/rooms/${id}/moderators`)
      .set(asAdmin())
      .send({ userId: p.id })
      .expect(200);
  const react = (as: ChatPerson, messageId: string, reaction: string, on = true) =>
    h()
      .http()
      [on ? 'put' : 'delete'](`/api/v1/chat/messages/${messageId}/reactions/${reaction}`)
      .set(bearer(as.token));
  /** A room with a moderator and two members in it. */
  async function roomWith(extra: object = {}) {
    const id = await createRoom(extra);
    // One after the other: several sign-ups at once reset connections on some machines.
    const mod = await member('Mod');
    const a = await member('Avi');
    const b = await member('Bella');
    await makeModerator(id, mod);
    await join(a, id).expect(200);
    await join(b, id).expect(200);
    return { id, mod, a, b };
  }
  return {
    createRoom,
    room,
    join,
    leave,
    roomSend,
    roomMessages,
    makeModerator,
    react,
    roomWith,
    tag,
    person,
    member,
    listed,
    consent,
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
    block,
    unblock,
    chatSettings,
    people,
    pair,
    bodies,
  };
}
