import { BroadcastsService } from '../src/modules/notifications/broadcasts.service';
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

/**
 * M7 checkpoint 3: broadcasts. One admin writes, a different admin approves, and only then
 * does the message reach members. The audience here is one membership type, so the tests reach
 * few people; the people made by a test are told apart by their own addresses.
 */
describe('broadcasts (integration)', () => {
  let h: Harness;
  let broadcasts: BroadcastsService;
  let author: { accessToken: string; userId: string };
  let approver: { accessToken: string; userId: string };
  let types: Record<string, string>;
  const run = Date.now();
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    broadcasts = h.app.get(BroadcastsService);
    author = await signInAdmin(h, 'broadcast-author');
    approver = await signInAdmin(h, 'broadcast-approver');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    // Emails still owed from earlier runs are out of the way.
    await broadcasts.deliverEmails();
    h.mailer.sent.length = 0;
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  const message = (extra: Record<string, unknown> = {}) => {
    const tag = `${run}-${++n}`;
    return {
      audience: { all: false, typeIds: [types.STUDENT] },
      translations: {
        he: { title: `הודעה לסטודנטים ${tag}`, body: `פסקה ראשונה ${tag}.\n\nפסקה שנייה.` },
        en: { title: `Message to students ${tag}`, body: `First paragraph ${tag}.\n\nSecond.` },
      },
      ...extra,
    };
  };
  interface Broadcast {
    id: string;
    status: string;
    mine: boolean;
    recipientCount: number | null;
    rejectReason: string | null;
    decidedBy: { id: string } | null;
    translations: { he?: { title: string; body: string }; en?: { title: string } };
  }
  const create = async (body: object = message(), who = author) =>
    (await h.http().post('/api/v1/admin/broadcasts').set(as(who)).send(body).expect(201))
      .body as Broadcast;
  const step = (who: { accessToken: string }, id: string, action: string, body?: object) => {
    const req = h.http().post(`/api/v1/admin/broadcasts/${id}/${action}`).set(as(who));
    return body ? req.send(body) : req;
  };
  async function pending(body?: object) {
    const draft = await create(body);
    await step(author, draft.id, 'submit').expect(200);
    return draft;
  }
  async function member(typeKey: string, then?: 'suspend') {
    const email = await createVerifiedUser(h, 'member');
    const created = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as(approver))
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
        .set(as(approver))
        .send({ reason: 'Test' })
        .expect(200);
    }
    return { email, token: (await signIn(h, email)).accessToken };
  }
  const notices = async (token: string) =>
    (
      (await h.http().get('/api/v1/notifications?pageSize=50').set(bearer(token)).expect(200)).body
        .items as { kind: string; type: string; link: string; params: Record<string, string> }[]
    ).filter((item) => item.kind === 'ASSOCIATION');
  const read = (token: string, id: string, locale = 'he') =>
    h.http().get(`/api/v1/broadcasts/${id}?locale=${locale}`).set(bearer(token));
  const setPreferences = (token: string, items: object[]) =>
    h
      .http()
      .put('/api/v1/me/notification-preferences')
      .set(bearer(token))
      .send({ items })
      .expect(200);

  it('is for admins only', async () => {
    const draft = await create();
    await expectAdminOnly(h, 'get', '/api/v1/admin/broadcasts');
    await expectAdminOnly(h, 'post', '/api/v1/admin/broadcasts', message());
    await expectAdminOnly(h, 'get', `/api/v1/admin/broadcasts/${draft.id}`);
    await expectAdminOnly(h, 'put', `/api/v1/admin/broadcasts/${draft.id}`, message());
    await expectAdminOnly(h, 'delete', `/api/v1/admin/broadcasts/${draft.id}`);
    await expectAdminOnly(h, 'get', `/api/v1/admin/broadcasts/${draft.id}/audience`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/broadcasts/${draft.id}/submit`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/broadcasts/${draft.id}/approve`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/broadcasts/${draft.id}/reject`, {
      reason: 'No',
    });
    // A content editor writes news, not broadcasts.
    const editor = await signInWithMfa(h, 'broadcast-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR'),
    );
    await h.http().get('/api/v1/admin/broadcasts').set(as(editor)).expect(403);
    await h.http().get(`/api/v1/broadcasts/${draft.id}`).expect(401);
  });

  it('creates a draft, validates it, and creates nothing twice for the same key', async () => {
    const draft = await create();
    expect(draft).toMatchObject({ status: 'DRAFT', mine: true, recipientCount: null });
    const seenByOther = await h
      .http()
      .get(`/api/v1/admin/broadcasts/${draft.id}`)
      .set(as(approver))
      .expect(200);
    expect(seenByOther.body.mine).toBe(false);

    const post = (body: object) =>
      h.http().post('/api/v1/admin/broadcasts').set(as(author)).send(body);
    await post({ audience: { all: true }, translations: {} }).expect(400);
    await post(message({ audience: { all: false, typeIds: [] } })).expect(400);
    const unknown = await post(
      message({ audience: { all: false, typeIds: ['0190a000-0000-7000-8000-00000000c0de'] } }),
    ).expect(400);
    expect(unknown.body.error.details[0].code).toBe('broadcastUnknownType');

    const key = `key-${run}`;
    const body = message();
    const first = await post(body).set('Idempotency-Key', key).expect(201);
    const second = await post(body).set('Idempotency-Key', key).expect(201);
    expect(second.body.id).toBe(first.body.id);
    // The key belongs to its author: another admin's request with it is a new message.
    const other = await h
      .http()
      .post('/api/v1/admin/broadcasts')
      .set(as(approver))
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(other.body.id).not.toBe(first.body.id);
  });

  it('only the author changes, submits or deletes a draft', async () => {
    const draft = await create();
    const put = (who: { accessToken: string }, body: object) =>
      h.http().put(`/api/v1/admin/broadcasts/${draft.id}`).set(as(who)).send(body);
    const refused = await put(approver, message()).expect(403);
    expect(refused.body.error.details[0].code).toBe('broadcastNotYours');
    expect((await step(approver, draft.id, 'submit').expect(403)).body.error.details[0].code).toBe(
      'broadcastNotYours',
    );
    await h.http().delete(`/api/v1/admin/broadcasts/${draft.id}`).set(as(approver)).expect(403);

    const changed = await put(author, message({ audience: { all: true, typeIds: [] } })).expect(
      200,
    );
    expect(changed.body.audience).toEqual({ all: true, typeIds: [] });
    await h.http().delete(`/api/v1/admin/broadcasts/${draft.id}`).set(as(author)).expect(204);
    await h.http().get(`/api/v1/admin/broadcasts/${draft.id}`).set(as(author)).expect(404);
  });

  it('needs Hebrew text before it can be submitted', async () => {
    const draft = await create(
      message({ translations: { en: { title: 'English only', body: 'Text.' } } }),
    );
    const refused = await step(author, draft.id, 'submit').expect(422);
    expect(refused.body.error.details[0].code).toBe('broadcastHebrewRequired');
  });

  it('the author can’t approve or reject their own message; a second admin can', async () => {
    const recipient = await member('STUDENT');
    const item = await pending();
    // Waiting for approval: nothing has reached anyone, and the text is closed to changes.
    expect(await notices(recipient.token)).toEqual([]);
    await h
      .http()
      .put(`/api/v1/admin/broadcasts/${item.id}`)
      .set(as(author))
      .send(message())
      .expect(422);

    const own = await step(author, item.id, 'approve').expect(403);
    expect(own.body.error.details[0].code).toBe('broadcastOwn');
    await step(author, item.id, 'reject', { reason: 'No' }).expect(403);
    expect(await notices(recipient.token)).toEqual([]);

    const sent = await step(approver, item.id, 'approve').expect(200);
    expect(sent.body).toMatchObject({ status: 'SENT', decidedBy: { id: approver.userId } });
    expect(sent.body.recipientCount).toBeGreaterThanOrEqual(1);
    expect(sent.body.sentAt).not.toBeNull();
    expect(await notices(recipient.token)).toHaveLength(1);
  });

  it('the database itself refuses an approval by the author', async () => {
    const item = await pending();
    await expect(
      h.db.query(`UPDATE broadcasts SET decided_by = created_by WHERE id = $1`, [item.id]),
    ).rejects.toThrow(/broadcasts_two_admins/);
  });

  it('a draft can’t be approved, and deciding needs the approve permission', async () => {
    const draft = await create();
    const refused = await step(approver, draft.id, 'approve').expect(422);
    expect(refused.body.error.details[0].code).toBe('broadcastStepNotAllowed');
  });

  it('a rejected message goes back to its author with the reason, and can be sent again', async () => {
    const item = await pending();
    await step(approver, item.id, 'reject', {}).expect(400);
    const rejected = await step(approver, item.id, 'reject', {
      reason: 'Please shorten it.',
    }).expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Please shorten it.',
      decidedBy: { id: approver.userId },
    });
    await step(approver, item.id, 'approve').expect(422);

    // Changing it makes it a draft again; then it is submitted and approved.
    const edited = await h
      .http()
      .put(`/api/v1/admin/broadcasts/${item.id}`)
      .set(as(author))
      .send(message())
      .expect(200);
    expect(edited.body).toMatchObject({ status: 'DRAFT', rejectReason: null, decidedBy: null });
    await step(author, item.id, 'submit').expect(200);
    await step(approver, item.id, 'approve').expect(200);
  });

  it('reaches exactly the audience of the moment it is approved, and only they can read it', async () => {
    const student = await member('STUDENT');
    const honorary = await member('HONORARY_MEMBER');
    const suspended = await member('STUDENT', 'suspend');
    const visitor = {
      token: (await signIn(h, await createVerifiedUser(h, 'visitor'))).accessToken,
    };
    const body = message();
    const item = await pending(body);

    const before = (
      await h
        .http()
        .get(`/api/v1/admin/broadcasts/${item.id}/audience`)
        .set(as(approver))
        .expect(200)
    ).body.count as number;
    const sent = await step(approver, item.id, 'approve').expect(200);
    // The count the approver saw is the number of people it reached.
    expect(sent.body.recipientCount).toBe(before);
    const { rows } = await h.db.query(
      'SELECT count(*) AS c FROM broadcast_deliveries WHERE broadcast_id = $1',
      [item.id],
    );
    expect(Number(rows[0].c)).toBe(before);

    const mine = await notices(student.token);
    expect(mine).toMatchObject([
      {
        kind: 'ASSOCIATION',
        type: 'broadcast',
        link: `/account/notifications/messages/${item.id}`,
        params: { titleHe: body.translations.he.title, titleEn: body.translations.en.title },
      },
    ]);
    expect(await notices(honorary.token)).toEqual([]);
    expect(await notices(suspended.token)).toEqual([]);

    const text = await read(student.token, item.id).expect(200);
    expect(text.body).toMatchObject({
      title: body.translations.he.title,
      paragraphs: [expect.stringContaining('פסקה ראשונה'), 'פסקה שנייה.'],
      locale: 'he',
    });
    expect((await read(student.token, item.id, 'en').expect(200)).body.title).toBe(
      body.translations.en.title,
    );
    // Everyone else, including other members and people who join later, gets "not found".
    await read(honorary.token, item.id).expect(404);
    await read(suspended.token, item.id).expect(404);
    await read(visitor.token, item.id).expect(404);
    const later = await member('STUDENT');
    await read(later.token, item.id).expect(404);
    expect(await notices(later.token)).toEqual([]);
  });

  it('a message that is not sent can’t be read by anyone', async () => {
    const student = await member('STUDENT');
    const item = await pending();
    await read(student.token, item.id).expect(404);
  });

  it('emails follow the member’s switch, once, however often sending runs', async () => {
    const wantsBoth = await member('STUDENT');
    const noEmail = await member('STUDENT');
    const noApp = await member('STUDENT');
    await setPreferences(noEmail.token, [{ kind: 'ASSOCIATION', app: true, email: false }]);
    await setPreferences(noApp.token, [{ kind: 'ASSOCIATION', app: false, email: true }]);
    const body = message();
    const item = await pending(body);
    await step(approver, item.id, 'approve').expect(200);
    // Approving sends no email by itself; the job does.
    expect(h.mailer.count(wantsBoth.email, 'broadcast')).toBe(0);

    await broadcasts.deliverEmails();
    await broadcasts.deliverEmails();
    expect(h.mailer.count(wantsBoth.email, 'broadcast')).toBe(1);
    expect(h.mailer.count(noEmail.email, 'broadcast')).toBe(0);
    expect(h.mailer.count(noApp.email, 'broadcast')).toBe(1);
    expect(await notices(noEmail.token)).toHaveLength(1);
    expect(await notices(noApp.token)).toHaveLength(0);
    // Switched off in the app, the message can still be opened from the email's link.
    await read(noApp.token, item.id).expect(200);

    const mail = h.mailer.last(wantsBoth.email, 'broadcast')!;
    expect(mail.params).toMatchObject({
      title: body.translations.en.title,
      link: expect.stringContaining(`/en/account/notifications/messages/${item.id}`),
    });
    expect(mail.paragraphs).toEqual([expect.stringContaining('First paragraph'), 'Second.']);
    expect(mail.unsubscribe!.link).toContain('/notifications/unsubscribe?t=');
  });

  it('two approvals at once send it once', async () => {
    const third = await signInAdmin(h, 'broadcast-third');
    const recipient = await member('STUDENT');
    const item = await pending();
    const results = await Promise.all([
      step(approver, item.id, 'approve'),
      step(third, item.id, 'approve'),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await notices(recipient.token)).toHaveLength(1);
    const { rows } = await h.db.query(
      `SELECT count(*) AS c FROM broadcast_deliveries d
       JOIN users u ON u.id = d.user_id WHERE d.broadcast_id = $1 AND u.email = $2`,
      [item.id, recipient.email],
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('a sent message is final: no change, no second decision, no deletion', async () => {
    await member('STUDENT');
    const item = await pending();
    await step(approver, item.id, 'approve').expect(200);

    await h
      .http()
      .put(`/api/v1/admin/broadcasts/${item.id}`)
      .set(as(author))
      .send(message())
      .expect(422);
    await h.http().delete(`/api/v1/admin/broadcasts/${item.id}`).set(as(author)).expect(422);
    await step(approver, item.id, 'approve').expect(422);
    await step(approver, item.id, 'reject', { reason: 'Too late' }).expect(422);
    await step(author, item.id, 'submit').expect(422);
    // The database refuses too, whatever the application does.
    await expect(
      h.db.query(`UPDATE broadcasts SET status = 'DRAFT' WHERE id = $1`, [item.id]),
    ).rejects.toThrow(/sent broadcast is final/);
    await expect(
      h.db.query(`UPDATE broadcast_translations SET title = 'x' WHERE broadcast_id = $1`, [
        item.id,
      ]),
    ).rejects.toThrow(/sent broadcast is final/);
    await expect(h.db.query(`DELETE FROM broadcasts WHERE id = $1`, [item.id])).rejects.toThrow(
      /sent broadcast is final/,
    );
  });

  it('lists broadcasts by state and audits every step', async () => {
    await member('STUDENT');
    const item = await pending();
    const waiting = await h
      .http()
      .get('/api/v1/admin/broadcasts?status=PENDING_APPROVAL&pageSize=100')
      .set(as(approver))
      .expect(200);
    expect(waiting.body.items.map((b: Broadcast) => b.id)).toContain(item.id);
    expect(waiting.body.items.every((b: Broadcast) => b.status === 'PENDING_APPROVAL')).toBe(true);
    await step(approver, item.id, 'approve').expect(200);

    const { rows } = await h.db.query<{ action: string; actor_user_id: string }>(
      `SELECT action, actor_user_id FROM audit_logs
       WHERE entity_type = 'broadcast' AND entity_id = $1 ORDER BY at`,
      [item.id],
    );
    expect(rows.map((row) => row.action)).toEqual([
      'broadcast.create',
      'broadcast.submit',
      'broadcast.approve',
    ]);
    expect(rows[2]!.actor_user_id).toBe(approver.userId);
  });
});
