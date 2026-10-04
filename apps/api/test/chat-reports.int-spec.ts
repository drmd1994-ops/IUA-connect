import { type PushMessage, PushProvider } from '../src/infra/push/push-provider';
import { ChatNotifier } from '../src/modules/chat/chat-notifier';
import { ChatReportsService } from '../src/modules/chat/chat-reports.service';
import { type Harness, bearer, expectAdminOnly, signInAdmin, startHarness } from './auth-harness';
import { type ChatPerson as Person, NOBODY, chatActors } from './chat-harness';

/** Records what the notifier hands to push, instead of sending nothing. */
class RecordingPush extends PushProvider {
  readonly enabled = true;
  readonly sent: PushMessage[] = [];

  async send(message: PushMessage): Promise<number> {
    this.sent.push(message);
    return 1;
  }
}

/**
 * M11 checkpoints 5 and 6: searching messages, the notices about them, reporting, and what
 * staff can and can't do. Everyone here is fictional.
 */
describe('chat: search, notices, reports and moderation (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string; userId: string; email: string };
  const push = new RecordingPush();
  const { tag, listed, start, send, messages, conversation, read, settings, pair, bodies } =
    chatActors(
      () => h,
      () => admin.accessToken,
    );
  let categories: Record<string, string>;

  beforeAll(async () => {
    h = await startHarness({ push });
    admin = await signInAdmin(h, 'chat-reports-admin');
    const res = await h
      .http()
      .get('/api/v1/chat/report-categories')
      .set(bearer(admin.accessToken))
      .expect(200);
    categories = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((c) => [c.key, c.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  const search = (as: Person, q: string, extra = '') =>
    h
      .http()
      .get(`/api/v1/chat/search?q=${encodeURIComponent(q)}${extra}`)
      .set(bearer(as.token));
  const report = (as: Person, body: object) =>
    h.http().post('/api/v1/chat/reports').set(bearer(as.token)).send(body);
  const adminGet = (path: string, token = admin.accessToken) =>
    h.http().get(`/api/v1/admin/chat/${path}`).set(bearer(token));
  const resolve = (id: string, body: object, token = admin.accessToken) =>
    h.http().post(`/api/v1/admin/chat/reports/${id}/resolve`).set(bearer(token)).send(body);
  const auditOf = async (entityId: string) =>
    (
      await h.db.query<{ action: string }>(
        `SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'chat.%' ORDER BY at`,
        [entityId],
      )
    ).rows.map((row) => row.action);

  describe('searching messages', () => {
    it('finds the reader’s own messages by text, Hebrew-aware, newest first', async () => {
      const word = tag();
      const { a, b, id } = await pair();
      await send(a, id, `First about ${word}`).expect(201);
      await send(b, id, `הַכְּנָסִים של ${word} בשבוע הבא`).expect(201);
      await send(a, id, 'Nothing to see').expect(201);

      const all = (await search(a, word).expect(200)).body.items;
      expect(all.map((item: { message: { seq: number } }) => item.message.seq)).toEqual([2, 1]);
      expect(all[0].other).toMatchObject({ id: b.id, firstName: 'Dana' });
      // A word start, and Hebrew without vowel marks and with a regular final letter.
      expect((await search(a, word.slice(0, 6)).expect(200)).body.items).toHaveLength(2);
      expect(
        (await search(a, `כנסימ ${word}`).expect(200)).body.items.map(
          (item: { message: { seq: number } }) => item.message.seq,
        ),
      ).toEqual([2]);
      expect((await search(a, `${word} missingword`).expect(200)).body.items).toEqual([]);
      // What a person types can't carry search operators.
      expect((await search(a, `${word} | nothing & !x`).expect(200)).body.items).toEqual([]);
      await search(a, 'x').expect(400);
      await h.http().get('/api/v1/chat/search?q=hello').expect(401);
    });

    it('never finds other people’s conversations, deleted or hidden messages', async () => {
      const word = tag();
      const { a, b, id } = await pair();
      const kept = (await send(a, id, `Kept ${word}`).expect(201)).body;
      const deleted = (await send(a, id, `Deleted ${word}`).expect(201)).body;
      const hidden = (await send(a, id, `Hidden ${word}`).expect(201)).body;
      await h.http().delete(`/api/v1/chat/messages/${deleted.id}`).set(bearer(a.token)).expect(204);
      await h
        .http()
        .post(`/api/v1/chat/messages/${hidden.id}/hide`)
        .set(bearer(b.token))
        .expect(204);
      const seen = async (as: Person, extra = '') =>
        (await search(as, word, extra).expect(200)).body.items.map(
          (item: { message: { id: string } }) => item.message.id,
        );
      expect(await seen(a)).toEqual([hidden.id, kept.id]);
      expect(await seen(b)).toEqual([kept.id]);
      expect(await seen(b, `&conversationId=${id}`)).toEqual([kept.id]);

      const c = await listed();
      expect(await seen(c)).toEqual([]);
      // Naming a conversation that isn't the reader's is "not found", like an invented one.
      await search(c, word, `&conversationId=${id}`).expect(404);
      await search(c, word, `&conversationId=${NOBODY}`).expect(404);
    });
  });

  describe('notices about messages', () => {
    const notifier = () => h.app.get(ChatNotifier);
    const later = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
    const emails = (p: Person) => h.mailer.sent.filter((m) => m.to === p.email);
    /** Makes the messages of a conversation 40 minutes old. */
    const waited = (id: string) =>
      h.db.query(
        `UPDATE messages SET created_at = created_at - interval '40 minutes'
         WHERE conversation_id = $1`,
        [id],
      );
    const preferences = (p: Person, app: boolean, email: boolean) =>
      h
        .http()
        .put('/api/v1/me/notification-preferences')
        .set(bearer(p.token))
        .send({ items: [{ kind: 'MESSAGES', app, email }] })
        .expect(200);

    it('one email a day at most, without the text or the sender', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'A confidential sentence').expect(201);
      // Not before the message has waited half an hour.
      await notifier().sendUnreadEmails(later(10));
      expect(emails(b).filter((m) => m.template === 'chatUnread')).toHaveLength(0);

      await waited(id);
      await notifier().sendUnreadEmails();
      const sent = emails(b).filter((m) => m.template === 'chatUnread');
      expect(sent).toHaveLength(1);
      expect(sent[0]!.params).toEqual({
        count: 1,
        link: expect.stringMatching(/\/en\/chat$/),
      });
      expect(sent[0]!.unsubscribe?.link).toContain('/notifications/unsubscribe?t=');
      expect(JSON.stringify(sent[0])).not.toMatch(/confidential|Noa|Fictional/);
      // The sender gets nothing about their own message.
      expect(emails(a).filter((m) => m.template === 'chatUnread')).toHaveLength(0);

      // The same unread message never causes a second email, and a new one not within a day.
      await notifier().sendUnreadEmails(later(60));
      await send(a, id, 'Another').expect(201);
      await notifier().sendUnreadEmails(later(120));
      expect(emails(b).filter((m) => m.template === 'chatUnread')).toHaveLength(1);
      await notifier().sendUnreadEmails(later(26 * 60));
      expect(emails(b).filter((m) => m.template === 'chatUnread')).toHaveLength(2);
    });

    it('none for a read, muted or archived conversation, or with the switch off', async () => {
      const waiting = async (prepare: (b: Person, id: string) => Promise<unknown>) => {
        const { a, b, id } = await pair();
        await send(a, id, 'Hello').expect(201);
        await prepare(b, id);
        await notifier().sendUnreadEmails(later(40));
        return emails(b).filter((m) => m.template === 'chatUnread').length;
      };
      expect(await waiting((b, id) => read(b, id).expect(204))).toBe(0);
      expect(await waiting((b, id) => settings(b, id, { mute: 'forever' }).expect(200))).toBe(0);
      expect(await waiting((b, id) => settings(b, id, { archived: true }).expect(200))).toBe(0);
      expect(await waiting((b) => preferences(b, true, false))).toBe(0);
      expect(await waiting(async () => undefined)).toBe(1);
    });

    it('the one-step unsubscribe link switches these emails off', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Hello').expect(201);
      await waited(id);
      await notifier().sendUnreadEmails();
      const link = emails(b).find((m) => m.template === 'chatUnread')!.unsubscribe!.link;
      const done = await h
        .http()
        .post('/api/v1/notifications/unsubscribe')
        .send({ token: new URL(link).searchParams.get('t') })
        .expect(200);
      expect(done.body.kinds).toEqual(['MESSAGES']);
      await send(a, id, 'Again').expect(201);
      await notifier().sendUnreadEmails(later(27 * 60));
      expect(emails(b).filter((m) => m.template === 'chatUnread')).toHaveLength(1);
    });

    it('the number on the Chat link follows the "in the app" switch', async () => {
      const { a, b, id } = await pair();
      await send(a, id, 'Hello').expect(201);
      const count = async () =>
        (await h.http().get('/api/v1/chat/unread-count').set(bearer(b.token)).expect(200)).body
          .conversations;
      expect(await count()).toBe(1);
      await preferences(b, false, true);
      expect(await count()).toBe(0);
    });

    it('push is handed a notice without text, unless muted or switched off', async () => {
      const { a, b, id } = await pair();
      const forB = () => push.sent.filter((m) => m.userId === b.id);
      await send(a, id, 'A confidential sentence').expect(201);
      expect(forB()).toEqual([
        { userId: b.id, locale: 'en', type: 'chatMessage', params: {}, link: `/chat/${id}` },
      ]);
      expect(push.sent.filter((m) => m.userId === a.id)).toEqual([]);

      await settings(b, id, { mute: '8h' }).expect(200);
      await send(a, id, 'Muted').expect(201);
      await settings(b, id, { mute: 'off' }).expect(200);
      await preferences(b, false, true);
      await send(a, id, 'Switched off').expect(201);
      expect(forB()).toHaveLength(1);
    });
  });

  describe('reporting', () => {
    it('keeps the reported message and five on each side, as they were', async () => {
      const { a, b, id } = await pair();
      for (let i = 1; i <= 14; i++) await send(i % 2 ? a : b, id, `line ${i}`).expect(201);
      const all = (await messages(b, id).expect(200)).body.items as { id: string; seq: number }[];
      const target = all.find((m) => m.seq === 9)!;

      await report(b, { messageId: target.id, categoryId: NOBODY }).expect(400);
      await report(b, { categoryId: categories.SPAM }).expect(400);
      await report(b, { messageId: target.id, userId: a.id, categoryId: categories.SPAM }).expect(
        400,
      );
      const created = await report(b, {
        messageId: target.id,
        categoryId: categories.HARASSMENT,
        description: '  Please look at this.  ',
      }).expect(201);
      // Reporting it again while the first is open changes nothing.
      const again = await report(b, { messageId: target.id, categoryId: categories.SPAM }).expect(
        200,
      );
      expect(again.body.id).toBe(created.body.id);

      // The sender deletes the message afterwards; the report still holds it.
      await h.http().delete(`/api/v1/chat/messages/${target.id}`).set(bearer(a.token)).expect(204);
      const detail = (await adminGet(`reports/${created.body.id}`).expect(200)).body;
      expect(detail).toMatchObject({
        status: 'OPEN',
        action: 'NONE',
        category: { key: 'HARASSMENT' },
        reporter: { id: b.id, firstName: 'Dana' },
        reported: { id: a.id, firstName: 'Noa' },
        aboutMessage: true,
        description: 'Please look at this.',
        reviewer: { id: null },
        resolution: null,
        reportedSuspended: false,
        canResolve: true,
      });
      expect(detail.messages.map((m: { seq: number }) => m.seq)).toEqual([
        4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ]);
      expect(detail.messages.filter((m: { reported: boolean }) => m.reported)).toEqual([
        expect.objectContaining({ seq: 9, body: 'line 9', senderId: a.id, deleted: false }),
      ]);
      expect(await auditOf(created.body.id)).toEqual(['chat.report.create', 'chat.report.view']);
    });

    it('only by someone in the conversation, and never about oneself', async () => {
      const { a, b, id } = await pair();
      const mine = (await send(a, id, 'Mine').expect(201)).body;
      const c = await listed();
      const category = { categoryId: categories.OTHER };
      await report(c, { messageId: mine.id, ...category }).expect(404);
      await report(c, { messageId: NOBODY, ...category }).expect(404);
      await report(c, { userId: a.id, ...category }).expect(404);
      await report(a, { userId: a.id, ...category }).expect(404);
      expect(
        (await report(a, { messageId: mine.id, ...category }).expect(422)).body.error.details[0]
          .code,
      ).toBe('chatReportOwnMessage');
      await h
        .http()
        .post('/api/v1/chat/reports')
        .send({ userId: a.id, ...category })
        .expect(401);
      await h.http().get('/api/v1/chat/report-categories').expect(401);

      // A report about a person carries no messages at all.
      const about = await report(b, { userId: a.id, ...category }).expect(201);
      const detail = (await adminGet(`reports/${about.body.id}`).expect(200)).body;
      expect(detail).toMatchObject({ aboutMessage: false, messages: [], reported: { id: a.id } });
      expect(
        (
          await resolve(about.body.id, { decision: 'deleteMessage', reason: 'No message' }).expect(
            422,
          )
        ).body.error.details[0].code,
      ).toBe('chatReportNoMessage');
    });

    it('offers the seeded reasons, in Hebrew and English', async () => {
      const res = await h
        .http()
        .get('/api/v1/chat/report-categories')
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(res.body.items.map((c: { key: string }) => c.key)).toEqual([
        'HARASSMENT',
        'SPAM',
        'PATIENT_INFORMATION',
        'IMPERSONATION',
        'OTHER',
      ]);
      for (const item of res.body.items) {
        expect(item.nameHe).toMatch(/[א-ת]/);
        expect(item.nameEn).toMatch(/[a-z]/);
      }
    });
  });

  describe('staff', () => {
    async function reported(): Promise<{
      a: Person;
      b: Person;
      id: string;
      messageId: string;
      reportId: string;
    }> {
      const { a, b, id } = await pair();
      const messageId = (await send(a, id, 'Something reportable').expect(201)).body.id as string;
      const reportId = (
        await report(b, { messageId, categoryId: categories.HARASSMENT }).expect(201)
      ).body.id as string;
      return { a, b, id, messageId, reportId };
    }

    it('every admin chat route follows the admin access pattern', async () => {
      await expectAdminOnly(h, 'get', '/api/v1/admin/chat/reports');
      await expectAdminOnly(h, 'get', `/api/v1/admin/chat/reports/${NOBODY}`);
      await expectAdminOnly(h, 'post', `/api/v1/admin/chat/reports/${NOBODY}/resolve`, {
        decision: 'dismiss',
        reason: 'Nothing wrong',
      });
      await expectAdminOnly(h, 'get', '/api/v1/admin/chat/suspensions');
      await expectAdminOnly(h, 'post', '/api/v1/admin/chat/suspensions', {
        userId: NOBODY,
        reason: 'Testing',
        days: 1,
      });
      await expectAdminOnly(h, 'post', `/api/v1/admin/chat/suspensions/${NOBODY}/lift`, {
        reason: 'Testing',
      });
      await adminGet(`reports/${NOBODY}`).expect(404);
    });

    it('lists reports with open ones first, and counts them on the dashboard', async () => {
      const dashboard = async () =>
        (await h.http().get('/api/v1/admin/dashboard').set(bearer(admin.accessToken)).expect(200))
          .body.chat.openReports as number;
      const before = await dashboard();
      const first = await reported();
      const second = await reported();
      expect(await dashboard()).toBe(before + 2);
      await resolve(first.reportId, { decision: 'dismiss', reason: 'Nothing wrong here' }).expect(
        200,
      );
      expect(await dashboard()).toBe(before + 1);

      const open = (await adminGet('reports?status=OPEN').expect(200)).body;
      expect(open.pageSize).toBe(20);
      expect(open.items.map((r: { id: string }) => r.id)).toContain(second.reportId);
      expect(open.items.map((r: { id: string }) => r.id)).not.toContain(first.reportId);
      // A list row never carries message text.
      expect(JSON.stringify(open.items)).not.toContain('reportable');
      const dismissed = (await adminGet('reports?status=DISMISSED').expect(200)).body.items;
      expect(dismissed.find((r: { id: string }) => r.id === first.reportId)).toMatchObject({
        status: 'DISMISSED',
        action: 'NONE',
      });
      const all = (await adminGet('reports').expect(200)).body.items as { status: string }[];
      const statuses = all.map((r) => r.status);
      expect(statuses.indexOf('OPEN')).toBe(0);
      await adminGet('reports?status=CLOSED').expect(400);
    });

    it('deleting the reported message removes it for both people', async () => {
      const { a, b, id, messageId, reportId } = await reported();
      await resolve(reportId, { decision: 'deleteMessage', reason: 'x' }).expect(400);
      await resolve(reportId, {
        decision: 'deleteMessage',
        reason: 'Against the rules',
        days: 3,
      }).expect(400);
      const done = (
        await resolve(reportId, { decision: 'deleteMessage', reason: 'Against the rules' }).expect(
          200,
        )
      ).body;
      expect(done).toMatchObject({
        status: 'UPHELD',
        action: 'MESSAGE_DELETED',
        resolution: 'Against the rules',
        reviewer: { id: admin.userId },
        canResolve: false,
      });
      expect(done.reviewedAt).not.toBeNull();
      for (const reader of [a, b]) {
        expect((await messages(reader, id).expect(200)).body.items[0]).toMatchObject({
          id: messageId,
          body: '',
          deleted: true,
        });
      }
      // A closed report can't be decided again.
      expect(
        (await resolve(reportId, { decision: 'dismiss', reason: 'Changed my mind' }).expect(409))
          .body.error.details[0].code,
      ).toBe('chatReportClosed');
      expect(await auditOf(reportId)).toEqual(['chat.report.create', 'chat.report.resolve']);
    });

    it('a suspended person can read and can’t send, until the suspension ends or is lifted', async () => {
      const { a, b, id, reportId } = await reported();
      await resolve(reportId, { decision: 'suspend', reason: 'Repeated abuse' }).expect(400);
      const done = (
        await resolve(reportId, { decision: 'suspend', reason: 'Repeated abuse', days: 7 }).expect(
          200,
        )
      ).body;
      expect(done).toMatchObject({
        status: 'UPHELD',
        action: 'SUSPENDED',
        reportedSuspended: true,
      });

      expect(bodies(await messages(a, id).expect(200))).toEqual(['Something reportable']);
      expect((await conversation(a, id).expect(200)).body.sendState).toBe('suspended');
      const refused = await send(a, id, 'Let me speak').expect(403);
      expect(refused.body.error.details[0].code).toBe('chatSuspended');
      expect((await start(a, (await listed()).id).expect(403)).body.error.details[0].code).toBe(
        'chatSuspended',
      );
      // The other person, and the rest of the site, are unaffected.
      await send(b, id, 'Still here').expect(201);
      await h.http().get('/api/v1/me/profile').set(bearer(a.token)).expect(200);

      const list = (await adminGet('suspensions').expect(200)).body.items as {
        id: string;
        user: { id: string };
        active: boolean;
        endsAt: string;
      }[];
      const row = list.find((s) => s.user.id === a.id)!;
      expect(row.active).toBe(true);
      expect(new Date(row.endsAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);

      const lifted = await h
        .http()
        .post(`/api/v1/admin/chat/suspensions/${row.id}/lift`)
        .set(bearer(admin.accessToken))
        .send({ reason: 'Apologised' })
        .expect(200);
      expect(lifted.body.active).toBe(false);
      await send(a, id, 'Thank you').expect(201);

      // One that has run out is over without anyone lifting it.
      const direct = await h
        .http()
        .post('/api/v1/admin/chat/suspensions')
        .set(bearer(admin.accessToken))
        .send({ userId: a.id, reason: 'A day off', days: 1 })
        .expect(201);
      await h
        .http()
        .post('/api/v1/admin/chat/suspensions')
        .set(bearer(admin.accessToken))
        .send({ userId: a.id, reason: 'Twice', days: 1 })
        .expect(409);
      await send(a, id, 'Suspended again').expect(403);
      await h.db.query(
        `UPDATE chat_suspensions
         SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
         WHERE id = $1`,
        [direct.body.id],
      );
      await send(a, id, 'Back').expect(201);
      expect(await auditOf(a.id)).toEqual(['chat.suspension.lift', 'chat.suspend']);
    });

    it('nobody decides on a report they are part of, or suspends themselves', async () => {
      const { a } = await pair();
      // The administrator is the reporter here: written straight into the database.
      const { rows } = await h.db.query<{ id: string }>(
        `INSERT INTO chat_reports (id, reporter_id, reported_user_id, category_id)
         VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
        [admin.userId, a.id, categories.OTHER],
      );
      const own = rows[0]!.id;
      expect((await adminGet(`reports/${own}`).expect(200)).body.canResolve).toBe(false);
      expect(
        (await resolve(own, { decision: 'dismiss', reason: 'My own report' }).expect(403)).body
          .error.details[0].code,
      ).toBe('chatReportOwn');
      const other = await signInAdmin(h, 'chat-reports-admin-2');
      await resolve(own, { decision: 'dismiss', reason: 'Looked at it' }, other.accessToken).expect(
        200,
      );
      await h
        .http()
        .post('/api/v1/admin/chat/suspensions')
        .set(bearer(admin.accessToken))
        .send({ userId: admin.userId, reason: 'Myself', days: 1 })
        .expect(403);
      await h
        .http()
        .post('/api/v1/admin/chat/suspensions')
        .set(bearer(admin.accessToken))
        .send({ userId: NOBODY, reason: 'Nobody', days: null })
        .expect(404);
    });

    it('the kept messages are erased 90 days after a report is closed', async () => {
      const { reportId } = await reported();
      await resolve(reportId, { decision: 'dismiss', reason: 'Nothing wrong here' }).expect(200);
      const service = h.app.get(ChatReportsService);
      await service.eraseOldCopies(new Date(Date.now() + 89 * 24 * 3600 * 1000));
      expect((await adminGet(`reports/${reportId}`).expect(200)).body.messages).toHaveLength(1);
      await service.eraseOldCopies(new Date(Date.now() + 91 * 24 * 3600 * 1000));
      const after = (await adminGet(`reports/${reportId}`).expect(200)).body;
      expect(after.messages).toEqual([]);
      expect(after.status).toBe('DISMISSED');
      // An open report keeps its copy however old it is.
      const open = await reported();
      await service.eraseOldCopies(new Date(Date.now() + 400 * 24 * 3600 * 1000));
      expect((await adminGet(`reports/${open.reportId}`).expect(200)).body.messages).toHaveLength(
        1,
      );
    });

    it('staff have no way to read a conversation, reported or not', async () => {
      const { id, messageId } = await reported();
      const staff = { token: admin.accessToken } as Person;
      await conversation(staff, id).expect(404);
      await messages(staff, id).expect(404);
      await h
        .http()
        .get(`/api/v1/admin/chat/conversations/${id}`)
        .set(bearer(staff.token))
        .expect(404);
      await h
        .http()
        .get(`/api/v1/admin/chat/messages/${messageId}`)
        .set(bearer(staff.token))
        .expect(404);
    });
  });
});
