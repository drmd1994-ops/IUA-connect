import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
  verifyPhysician,
} from './auth-harness';

interface Person {
  id: string;
  email: string;
  accessToken: string;
}

/** M25: communities. Everyone and everything here is fictional; the text says nothing medical. */
describe('communities (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let community: { id: string; slug: string };
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'communities-admin');
    // A community of its own, so the counts here are this run's.
    const created = await h
      .http()
      .post('/api/v1/admin/communities')
      .set(as(admin))
      .send({ slug: `test-${run}`, nameHe: `קהילת בדיקה ${run}`, nameEn: `Test community ${run}` })
      .expect(201);
    community = created.body;
  });

  afterAll(async () => {
    await h.close();
  });

  async function person(verified = true, first = `Name${run}`): Promise<Person> {
    const email = await createVerifiedUser(h, 'community');
    if (verified) await verifyPhysician(h, email);
    const { accessToken } = await signIn(h, email);
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(accessToken))
      .send({ firstName: `${first}${++n}`, lastName: 'Fictional' })
      .expect(200);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { id: rows[0]!.id, email, accessToken };
  }

  const write = (who: Person, body: Record<string, unknown> = {}) =>
    h
      .http()
      .post(`/api/v1/communities/${community.slug}/posts`)
      .set(as(who))
      .send({ title: `A topic ${++n}`, body: 'What do you think about this approach?', ...body });
  const comment = (who: Person, postId: string, body: Record<string, unknown> = {}) =>
    h
      .http()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(as(who))
      .send({ body: 'I would wait and see.', ...body });
  const notices = async (userId: string, type: string) =>
    (
      await h.db.query('SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2', [
        userId,
        type,
      ])
    ).rowCount;

  it('is for verified people', async () => {
    await h.http().get('/api/v1/communities').expect(401);
    const unverified = await person(false);
    const res = await h.http().get('/api/v1/communities').set(as(unverified)).expect(403);
    expect(res.body.error.details[0].code).toBe('membersOnly');
    const reader = await person();
    const list = await h.http().get('/api/v1/communities').set(as(reader)).expect(200);
    const slugs = list.body.items.map((c: { slug: string }) => c.slug);
    // One for each subspecialty, from the reference data, and this run's.
    expect(slugs).toEqual(expect.arrayContaining(['uro-oncology', 'andrology', community.slug]));
  });

  it('refuses a patient’s details, saying what was found', async () => {
    const writer = await person();
    const res = await write(writer, { body: 'Seen with ID 123456782 last week.' }).expect(400);
    expect(res.body.error.details).toEqual([
      { field: 'body', code: 'patientIdNumber', value: '123456782' },
    ]);
    const post = (await write(writer).expect(201)).body;
    const refused = await comment(writer, post.id, { body: 'His phone: 052-1234567' }).expect(400);
    expect(refused.body.error.details[0]).toMatchObject({ code: 'patientPhone' });
  });

  it('lists a post, tells followers, and the writer about comments and replies', async () => {
    const writer = await person();
    const follower = await person();
    const replier = await person();
    await h
      .http()
      .put(`/api/v1/communities/${community.slug}/follow`)
      .set(as(follower))
      .expect(204);
    const post = (await write(writer, { mentions: [replier.id] }).expect(201)).body;
    expect(post).toMatchObject({ kind: 'DISCUSSION', canEdit: true, canComment: true });
    expect(await notices(follower.id, 'communityPost')).toBe(1);
    expect(await notices(replier.id, 'communityMention')).toBe(1);

    const feed = await h.http().get('/api/v1/communities/feed').set(as(follower)).expect(200);
    expect(feed.body.items.map((p: { id: string }) => p.id)).toContain(post.id);

    const withComment = (await comment(follower, post.id).expect(201)).body;
    expect(await notices(writer.id, 'communityComment')).toBe(1);
    const first = withComment.comments[0];
    const withReply = (await comment(replier, post.id, { parentId: first.id }).expect(201)).body;
    expect(withReply.comments[1]).toMatchObject({ parentId: first.id });
    expect(await notices(follower.id, 'communityReply')).toBe(1);
    expect(withReply.commentCount).toBe(2);

    const listed = await h
      .http()
      .get(`/api/v1/communities/${community.slug}/posts`)
      .set(as(follower))
      .expect(200);
    expect(listed.body.items[0]).toMatchObject({ id: post.id, commentCount: 2 });
  });

  it('lets a question’s writer mark an answer, and readers react and bookmark', async () => {
    const asker = await person();
    const helper = await person();
    const post = (await write(asker, { kind: 'QUESTION' }).expect(201)).body;
    const answer = (await comment(helper, post.id).expect(201)).body.comments[0];
    await h
      .http()
      .put(`/api/v1/posts/${post.id}/answer`)
      .set(as(helper))
      .send({ commentId: answer.id })
      .expect(404);
    const marked = await h
      .http()
      .put(`/api/v1/posts/${post.id}/answer`)
      .set(as(asker))
      .send({ commentId: answer.id })
      .expect(200);
    expect(marked.body.answered).toBe(true);
    expect(marked.body.comments[0].isAnswer).toBe(true);

    const reacted = await h
      .http()
      .put(`/api/v1/post-comments/${answer.id}/reactions/thanks`)
      .set(as(asker))
      .expect(200);
    expect(reacted.body.comments[0].reactions).toEqual([
      { reaction: 'thanks', count: 1, mine: true },
    ]);
    await h.http().put(`/api/v1/posts/${post.id}/reactions/nope`).set(as(asker)).expect(400);

    await h.http().put(`/api/v1/posts/${post.id}/bookmark`).set(as(helper)).expect(204);
    const kept = await h.http().get('/api/v1/communities/bookmarks').set(as(helper)).expect(200);
    expect(kept.body.items.map((p: { id: string }) => p.id)).toEqual([post.id]);
  });

  it('keeps a post editable for a day', async () => {
    const writer = await person();
    const post = (await write(writer).expect(201)).body;
    await h
      .http()
      .patch(`/api/v1/posts/${post.id}`)
      .set(as(writer))
      .send({ title: 'Changed', body: 'Changed text.' })
      .expect(200);
    await h.db.query("UPDATE posts SET created_at = now() - interval '2 days' WHERE id = $1", [
      post.id,
    ]);
    const late = await h
      .http()
      .patch(`/api/v1/posts/${post.id}`)
      .set(as(writer))
      .send({ title: 'Again', body: 'Again.' })
      .expect(422);
    expect(late.body.error.details[0].code).toBe('communityEditWindowOver');
  });

  it('lets a moderator remove, lock and ban; and nobody else', async () => {
    const moderator = await person();
    const writer = await person();
    const reader = await person();
    await h
      .http()
      .post(`/api/v1/admin/communities/${community.id}/moderators`)
      .set(as(admin))
      .send({ userId: moderator.id })
      .expect(200);
    const post = (await write(writer).expect(201)).body;
    const said = (await comment(reader, post.id).expect(201)).body.comments[0];

    await h
      .http()
      .post(`/api/v1/post-comments/${said.id}/remove`)
      .set(as(writer))
      .send({ reason: 'No' })
      .expect(403);
    const removed = await h
      .http()
      .post(`/api/v1/post-comments/${said.id}/remove`)
      .set(as(moderator))
      .send({ reason: 'Off topic' })
      .expect(200);
    expect(removed.body.comments[0]).toMatchObject({
      body: '',
      removed: 'moderator',
      removedReason: 'Off topic',
    });

    await h.http().post(`/api/v1/posts/${post.id}/lock`).set(as(moderator)).expect(200);
    const locked = await comment(reader, post.id).expect(422);
    expect(locked.body.error.details[0].code).toBe('communityPostLocked');

    await h
      .http()
      .post(`/api/v1/communities/${community.slug}/bans`)
      .set(as(moderator))
      .send({ userId: reader.id, reason: 'Repeated off-topic posts', days: 7 })
      .expect(204);
    const banned = await write(reader).expect(403);
    expect(banned.body.error.details[0].code).toBe('communityBanned');
    // A banned person still reads.
    await h.http().get(`/api/v1/posts/${post.id}`).set(as(reader)).expect(200);

    const gone = await h
      .http()
      .post(`/api/v1/posts/${post.id}/remove`)
      .set(as(moderator))
      .send({ reason: 'Duplicate' })
      .expect(200);
    expect(gone.body).toMatchObject({ title: null, body: '', removed: 'moderator', comments: [] });
    const { rows } = await h.db.query(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'community.post.remove'",
      [post.id],
    );
    expect(rows).toHaveLength(1);
  });

  it('doesn’t tell someone about a person they blocked', async () => {
    const writer = await person();
    const follower = await person();
    await h.db.query('INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
      follower.id,
      writer.id,
    ]);
    await h
      .http()
      .put(`/api/v1/communities/${community.slug}/follow`)
      .set(as(follower))
      .expect(204);
    const before = await notices(follower.id, 'communityPost');
    await write(writer).expect(201);
    expect(await notices(follower.id, 'communityPost')).toBe(before);
  });

  it('keeps the staff pages for staff with the permission', async () => {
    const reader = await person();
    await h.http().get('/api/v1/admin/communities').set(as(reader)).expect(403);
    const list = await h.http().get('/api/v1/admin/communities').set(as(admin)).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toContain(community.id);
    await h
      .http()
      .post(`/api/v1/admin/communities/${community.id}/archive`)
      .set(as(admin))
      .expect(200);
    await h.http().get(`/api/v1/communities/${community.slug}`).set(as(reader)).expect(404);
    await h
      .http()
      .post(`/api/v1/admin/communities/${community.id}/restore`)
      .set(as(admin))
      .expect(200);
  });
});
