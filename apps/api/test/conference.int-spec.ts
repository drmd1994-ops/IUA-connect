import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { GUEST_ALLOWED_KEY } from '../src/common/decorators/access.decorators';
import {
  ConferenceChairController,
  ConferenceController,
} from '../src/modules/events/conference.controller';
import { ConferenceJobs } from '../src/modules/events/conference.job';
import { ConferenceService } from '../src/modules/events/conference.service';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M32: a session's live part, and the guest entry. */
describe('conference mode (integration)', () => {
  let h: Harness;
  let prisma: PrismaService;
  let admin: { accessToken: string };
  const run = Date.now();
  const as = () => bearer(admin.accessToken);
  const HOUR = 60 * 60 * 1000;
  let n = 0;

  beforeAll(async () => {
    h = await startHarness();
    prisma = h.app.get(PrismaService);
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
  });

  afterAll(async () => {
    await h.close();
  });

  /** A published event with one session on now, and one that isn't. */
  async function conference(extra: Record<string, unknown> = {}) {
    const now = Date.now();
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as())
      .send({
        startAt: new Date(now - HOUR).toISOString(),
        endAt: new Date(now + 5 * HOUR).toISOString(),
        translations: { he: { title: `כנס ${run} ${++n}` } },
        ...extra,
      })
      .expect(201);
    const id = created.body.id as string;
    const slug = created.body.slug as string;
    await h.http().post(`/api/v1/admin/events/${id}/publish`).set(as()).expect(200);
    const session = async (from: number, to: number) =>
      (
        await h
          .http()
          .post(`/api/v1/admin/events/${id}/sessions`)
          .set(as())
          .send({
            startAt: new Date(now + from * HOUR).toISOString(),
            endAt: new Date(now + to * HOUR).toISOString(),
            translations: { he: { title: `מושב ${++n}` } },
          })
          .expect(201)
      ).body.id as string;
    const sessionId = await session(-0.5, 1);
    const laterId = await session(3, 4);
    return { id, slug, sessionId, laterId, base: `/api/v1/events/${slug}/sessions/${sessionId}` };
  }

  async function person() {
    const email = await createVerifiedUser(h, 'attendee');
    return { email, token: (await signIn(h, email)).accessToken };
  }

  async function poll(base: string, open = true) {
    await h
      .http()
      .post(`${base}/chair/polls`)
      .set(as())
      .send({ question: `שאלה ${++n}`, options: ['א', 'ב'] })
      .expect(204);
    const live = await h.http().get(`${base}/live`).set(as()).expect(200);
    const created = live.body.polls[0];
    if (open) await h.http().post(`${base}/chair/polls/${created.id}/open`).set(as()).expect(204);
    return {
      id: created.id as string,
      options: created.options.map((o: { id: string }) => o.id) as string[],
    };
  }

  async function guest(slug: string, code: string) {
    const res = await h
      .http()
      .post(`/api/v1/events/${slug}/guest-entry`)
      .send({ code })
      .expect(200);
    return { token: res.body.accessToken as string, number: res.body.number as number };
  }

  async function openedEntry(eventId: string) {
    const now = Date.now();
    const res = await h
      .http()
      .put(`/api/v1/admin/events/${eventId}/guest-entry`)
      .set(as())
      .send({
        from: new Date(now - HOUR).toISOString(),
        until: new Date(now + HOUR).toISOString(),
      })
      .expect(200);
    expect(res.body.open).toBe(true);
    return new URL(res.body.link).searchParams.get('code')!;
  }

  describe('polls', () => {
    it('counts one vote per person, also when two arrive together', async () => {
      const c = await conference();
      const p = await poll(c.base);
      const voter = await person();
      const vote = () =>
        h
          .http()
          .post(`${c.base}/polls/${p.id}/vote`)
          .set(bearer(voter.token))
          .send({ optionId: p.options[0] });
      const answers = await Promise.all([vote(), vote(), vote()]);
      expect(answers.map((a) => a.status).sort()).toEqual([204, 409, 409]);
      const live = await h.http().get(`${c.base}/live`).set(bearer(voter.token)).expect(200);
      expect(live.body.polls[0].total).toBe(1);
      expect(live.body.polls[0].voted).toBe(true);
    });

    it('stores nothing that links a vote to a person', async () => {
      const c = await conference();
      const p = await poll(c.base);
      const voter = await person();
      await h
        .http()
        .post(`${c.base}/polls/${p.id}/vote`)
        .set(bearer(voter.token))
        .send({ optionId: p.options[1] })
        .expect(204);
      // Who voted: the poll and the person, and not one thing more.
      const voters = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM poll_voters WHERE poll_id = '${p.id}'`,
      );
      expect(voters).toHaveLength(1);
      expect(Object.keys(voters[0]!).sort()).toEqual(['poll_id', 'user_id']);
      // What was chosen: a count, with no person and no time.
      const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'poll_options'`,
      );
      expect(columns.map((c) => c.column_name).sort()).toEqual([
        'id',
        'poll_id',
        'sort_order',
        'text',
        'votes',
      ]);
      const me = await h.http().get('/api/v1/me').set(bearer(voter.token)).expect(200);
      const audited = await h.db.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE actor_user_id = $1 AND action LIKE 'conference.%'`,
        [me.body.id],
      );
      expect(audited.rows[0].n).toBe(0);
    });

    it('hides results until the reader voted or the poll closed, and refuses a closed poll', async () => {
      const c = await conference();
      const p = await poll(c.base);
      const reader = await person();
      const read = async () =>
        (await h.http().get(`${c.base}/live`).set(bearer(reader.token)).expect(200)).body.polls[0];
      expect((await read()).total).toBeNull();
      expect((await read()).options[0].votes).toBeNull();
      await h.http().post(`${c.base}/chair/polls/${p.id}/close`).set(as()).expect(204);
      expect((await read()).total).toBe(0);
      await h
        .http()
        .post(`${c.base}/polls/${p.id}/vote`)
        .set(bearer(reader.token))
        .send({ optionId: p.options[0] })
        .expect(422);
    });

    it('shows a draft only to the chair', async () => {
      const c = await conference();
      await poll(c.base, false);
      const reader = await person();
      const live = await h.http().get(`${c.base}/live`).set(bearer(reader.token)).expect(200);
      expect(live.body.polls).toEqual([]);
    });
  });

  describe('chairs and moderators', () => {
    it('gives a chair their own session and no other', async () => {
      const c = await conference();
      const chair = await person();
      const stranger = await person();
      const staff = `/api/v1/admin/events/${c.id}/sessions/${c.sessionId}/staff`;
      await h
        .http()
        .put(staff)
        .set(as())
        .send({ chairs: [chair.email], moderators: [] })
        .expect(200);
      const body = { question: 'שאלה', options: ['א', 'ב'] };
      await h.http().post(`${c.base}/chair/polls`).set(bearer(chair.token)).send(body).expect(204);
      await h
        .http()
        .post(`/api/v1/events/${c.slug}/sessions/${c.laterId}/chair/polls`)
        .set(bearer(chair.token))
        .send(body)
        .expect(403);
      await h
        .http()
        .post(`${c.base}/chair/polls`)
        .set(bearer(stranger.token))
        .send(body)
        .expect(403);
      await h.http().get(staff).set(bearer(chair.token)).expect(403);
    });

    it('refuses an unknown address as staff', async () => {
      const c = await conference();
      await h
        .http()
        .put(`/api/v1/admin/events/${c.id}/sessions/${c.sessionId}/staff`)
        .set(as())
        .send({ chairs: ['nobody-here@example.test'], moderators: [] })
        .expect(400);
    });
  });

  describe('questions', () => {
    it('keeps a question from the hall until a moderator lets it through', async () => {
      const c = await conference();
      const asker = await person();
      const reader = await person();
      await h
        .http()
        .post(`${c.base}/questions`)
        .set(bearer(asker.token))
        .send({ text: 'מה דעתך?' })
        .expect(204);
      const read = async (token: string) =>
        (await h.http().get(`${c.base}/live`).set(bearer(token)).expect(200)).body.questions;
      expect(await read(reader.token)).toEqual([]);
      const waiting = await read(admin.accessToken);
      expect(waiting[0].status).toBe('PENDING');
      await h
        .http()
        .put(`${c.base}/chair/questions/${waiting[0].id}/status`)
        .set(bearer(reader.token))
        .send({ status: 'VISIBLE' })
        .expect(403);
      await h
        .http()
        .put(`${c.base}/chair/questions/${waiting[0].id}/status`)
        .set(as())
        .send({ status: 'VISIBLE' })
        .expect(204);
      expect((await read(reader.token))[0].text).toBe('מה דעתך?');
      await h
        .http()
        .put(`${c.base}/chair/questions/${waiting[0].id}/status`)
        .set(as())
        .send({ status: 'HIDDEN' })
        .expect(204);
      expect(await read(reader.token)).toEqual([]);
    });

    it('takes an anonymous question only if the chair allows, and keeps no author', async () => {
      const c = await conference();
      const asker = await person();
      const send = () =>
        h
          .http()
          .post(`${c.base}/questions`)
          .set(bearer(asker.token))
          .send({ text: 'בלי שם', anonymous: true });
      await send().expect(400);
      await h
        .http()
        .patch(`${c.base}/chair/settings`)
        .set(as())
        .send({ allowAnonymousQuestions: true, moderateQuestions: false })
        .expect(204);
      await send().expect(204);
      const row = await prisma.sessionQuestion.findFirstOrThrow({
        where: { sessionId: c.sessionId },
      });
      expect(row.authorId).toBeNull();
      expect(row.status).toBe('VISIBLE');
    });

    it('counts one up-vote per person, and takes it back', async () => {
      const c = await conference();
      await h
        .http()
        .patch(`${c.base}/chair/settings`)
        .set(as())
        .send({ moderateQuestions: false })
        .expect(204);
      const reader = await person();
      await h
        .http()
        .post(`${c.base}/questions`)
        .set(bearer(reader.token))
        .send({ text: 'שאלה' })
        .expect(204);
      const read = async () =>
        (await h.http().get(`${c.base}/live`).set(bearer(reader.token)).expect(200)).body
          .questions[0];
      const { id } = await read();
      const up = `${c.base}/questions/${id}/upvote`;
      await h.http().put(up).set(bearer(reader.token)).expect(204);
      await h.http().put(up).set(bearer(reader.token)).expect(204);
      expect(await read()).toMatchObject({ upvotes: 1, upvoted: true });
      await h.http().delete(up).set(bearer(reader.token)).expect(204);
      expect(await read()).toMatchObject({ upvotes: 0, upvoted: false });
    });

    it('refuses questions long before a session', async () => {
      const c = await conference();
      const asker = await person();
      await h
        .http()
        .post(`/api/v1/events/${c.slug}/sessions/${c.laterId}/questions`)
        .set(bearer(asker.token))
        .send({ text: 'מוקדם מדי' })
        .expect(422);
    });
  });

  describe('feedback', () => {
    it('takes one from each person, and links none to them', async () => {
      const c = await conference();
      const p = await person();
      const give = () =>
        h
          .http()
          .post(`${c.base}/feedback`)
          .set(bearer(p.token))
          .send({ rating: 4, comment: 'טוב' });
      await give().expect(204);
      await give().expect(409);
      const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'session_feedback'`,
      );
      expect(columns.map((row) => row.column_name).sort()).toEqual([
        'comment',
        'id',
        'rating',
        'session_id',
      ]);
      const row = await prisma.sessionFeedback.findFirstOrThrow({
        where: { sessionId: c.sessionId },
      });
      // Not a time-ordered id, which would carry the time.
      expect(row.id[14]).toBe('4');
      const summary = await h.http().get(`${c.base}/chair/feedback`).set(as()).expect(200);
      expect(summary.body).toEqual({ count: 1, average: 4, comments: ['טוב'] });
      await h.http().get(`${c.base}/chair/feedback`).set(bearer(p.token)).expect(403);
    });
  });

  describe('the guest entry', () => {
    it('refuses a wrong code, and a closed entry', async () => {
      const c = await conference();
      const enter = (code: string) =>
        h.http().post(`/api/v1/events/${c.slug}/guest-entry`).send({ code });
      await enter('anything').expect(422);
      const code = await openedEntry(c.id);
      await enter('wrong').expect(422);
      await enter(code).expect(200);
      await h.http().delete(`/api/v1/admin/events/${c.id}/guest-entry`).set(as()).expect(200);
      await enter(code).expect(422);
    });

    it('lets a guest take part, under a number and with no details', async () => {
      const c = await conference();
      const code = await openedEntry(c.id);
      const p = await poll(c.base);
      const first = await guest(c.slug, code);
      const second = await guest(c.slug, code);
      expect(second.number).toBe(first.number + 1);
      await h
        .http()
        .post(`${c.base}/polls/${p.id}/vote`)
        .set(bearer(first.token))
        .send({ optionId: p.options[0] })
        .expect(204);
      await h
        .http()
        .patch(`${c.base}/chair/settings`)
        .set(as())
        .send({ moderateQuestions: false })
        .expect(204);
      await h
        .http()
        .post(`${c.base}/questions`)
        .set(bearer(first.token))
        .send({ text: 'שאלת אורח' })
        .expect(204);
      const live = await h.http().get(`${c.base}/live`).set(bearer(second.token)).expect(200);
      expect(live.body.questions[0]).toMatchObject({
        authorName: null,
        guestNumber: first.number,
      });
      const me = await h.http().get('/api/v1/me').set(bearer(first.token)).expect(200);
      expect(me.body.guest).toEqual({ number: first.number, eventSlug: c.slug });
      expect(me.body.permissions).toEqual([]);
    });

    it('keeps a guest out of everything else', async () => {
      const c = await conference();
      const other = await conference();
      const code = await openedEntry(c.id);
      const g = await guest(c.slug, code);
      const as_ = bearer(g.token);
      for (const path of [
        '/api/v1/chat/conversations',
        '/api/v1/chat/unread-count',
        '/api/v1/auth/sessions',
        '/api/v1/notifications',
        '/api/v1/members',
        '/api/v1/me/schedule',
      ]) {
        const res = await h.http().get(path).set(as_);
        expect([path, res.status]).toEqual([path, 403]);
      }
      await h.http().patch('/api/v1/me').set(as_).send({ locale: 'en' }).expect(403);
      await h.http().post(`/api/v1/events/${c.slug}/registration`).set(as_).expect(403);
      await h.http().get(`${other.base}/live`).set(as_).expect(404);
      await h
        .http()
        .post(`${c.base}/chair/polls`)
        .set(as_)
        .send({
          question: 'לא',
          options: ['א', 'ב'],
        })
        .expect(403);
      // Public pages stay as they are for anyone.
      await h.http().get(`/api/v1/events/${c.slug}`).set(as_).expect(200);
    });

    it('allows a guest only the routes meant for taking part', () => {
      const reflector = new Reflector();
      expect(reflector.get(GUEST_ALLOWED_KEY, ConferenceController)).toBe(true);
      // The chair's routes are not for guests, by the class having no such mark.
      expect(reflector.get(GUEST_ALLOWED_KEY, ConferenceChairController)).toBeUndefined();
    });

    it('never signs a guest in with a password', async () => {
      const c = await conference();
      const code = await openedEntry(c.id);
      const g = await guest(c.slug, code);
      const me = await h.http().get('/api/v1/me').set(bearer(g.token)).expect(200);
      await h
        .http()
        .post('/api/v1/auth/login')
        .send({ email: me.body.email, password: '!guest' })
        .expect(401);
    });
  });

  describe('the demonstration', () => {
    it('is only for the demo conference', async () => {
      const c = await conference();
      await h.http().post(`/api/v1/admin/events/${c.id}/demonstration`).set(as()).expect(422);
    });

    it('moves the sessions to now, clears what was left and opens the entry', async () => {
      const c = await conference();
      const p = await poll(c.base);
      const code = await openedEntry(c.id);
      const g = await guest(c.slug, code);
      await h
        .http()
        .post(`${c.base}/polls/${p.id}/vote`)
        .set(bearer(g.token))
        .send({ optionId: p.options[0] })
        .expect(204);
      // The rule reads the name; the test's event takes it for the moment.
      await prisma.event.updateMany({
        where: { slug: 'demo-conference' },
        data: { slug: `demo-conference-kept-${randomUUID()}` },
      });
      await prisma.event.update({ where: { id: c.id }, data: { slug: 'demo-conference' } });
      try {
        const service = h.app.get(ConferenceService);
        const result = await service.startDemonstration(c.id, 'en', {
          userId: (await prisma.user.findFirstOrThrow({ select: { id: true } })).id,
          meta: { ip: null, userAgent: null, correlationId: randomUUID() } as never,
        });
        expect(result.open).toBe(true);
        const sessions = await prisma.eventSession.findMany({
          where: { eventId: c.id },
          orderBy: { startAt: 'asc' },
        });
        expect(sessions[0]!.startAt.getTime()).toBeLessThan(Date.now());
        expect(sessions[0]!.endAt.getTime()).toBeGreaterThan(Date.now());
        expect(await prisma.eventGuest.count({ where: { eventId: c.id } })).toBe(0);
        const reopened = await prisma.poll.findUniqueOrThrow({
          where: { id: p.id },
          include: { options: true, voters: true },
        });
        expect(reopened.status).toBe('DRAFT');
        expect(reopened.voters).toEqual([]);
        expect(reopened.options.every((o) => o.votes === 0)).toBe(true);
      } finally {
        await prisma.event.update({
          where: { id: c.id },
          data: { slug: `done-${randomUUID()}` },
        });
      }
    });
  });

  describe('jobs', () => {
    it('reminds once, in the app and not by email, ten minutes before a session', async () => {
      const now = Date.now();
      const created = await h
        .http()
        .post('/api/v1/admin/events')
        .set(as())
        .send({
          startAt: new Date(now + 5 * 60 * 1000).toISOString(),
          endAt: new Date(now + 5 * HOUR).toISOString(),
          registrationMode: 'INTERNAL',
          translations: { he: { title: `כנס תזכורת ${run} ${++n}` } },
        })
        .expect(201);
      const { id, slug } = created.body as { id: string; slug: string };
      await h.http().post(`/api/v1/admin/events/${id}/publish`).set(as()).expect(200);
      const session = await h
        .http()
        .post(`/api/v1/admin/events/${id}/sessions`)
        .set(as())
        .send({
          startAt: new Date(now + 5 * 60 * 1000).toISOString(),
          endAt: new Date(now + HOUR).toISOString(),
          translations: { he: { title: 'מושב קרוב' } },
        })
        .expect(201);
      const p = await person();
      await h.http().post(`/api/v1/events/${slug}/registration`).set(bearer(p.token)).expect(200);
      await h
        .http()
        .put(`/api/v1/events/${slug}/schedule`)
        .set(bearer(p.token))
        .send({ sessionIds: [session.body.id] })
        .expect(200);
      const before = h.mailer.count(p.email, 'eventReminder');
      const jobs = h.app.get(ConferenceJobs);
      await jobs.sendReminders();
      await jobs.sendReminders();
      const notices = await prisma.notification.findMany({
        where: { user: { email: p.email }, type: 'sessionReminder' },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0]!.params).toMatchObject({ title: 'מושב קרוב' });
      expect(h.mailer.count(p.email, 'eventReminder')).toBe(before);
    });

    it('removes questions and guests 30 days after the event, and keeps results', async () => {
      const c = await conference();
      const code = await openedEntry(c.id);
      const p = await poll(c.base);
      const g = await guest(c.slug, code);
      await h
        .http()
        .post(`${c.base}/polls/${p.id}/vote`)
        .set(bearer(g.token))
        .send({ optionId: p.options[0] })
        .expect(204);
      await h
        .http()
        .post(`${c.base}/questions`)
        .set(bearer(g.token))
        .send({ text: 'שאלה' })
        .expect(204);
      const jobs = h.app.get(ConferenceJobs);
      const soon = await jobs.cleanUp(new Date());
      expect(await prisma.eventGuest.count({ where: { eventId: c.id } })).toBe(1);
      expect(soon.guests).toBeGreaterThanOrEqual(0);
      await jobs.cleanUp(new Date(Date.now() + 40 * 24 * HOUR));
      expect(await prisma.eventGuest.count({ where: { eventId: c.id } })).toBe(0);
      expect(await prisma.sessionQuestion.count({ where: { sessionId: c.sessionId } })).toBe(0);
      const kept = await prisma.pollOption.findUniqueOrThrow({ where: { id: p.options[0]! } });
      expect(kept.votes).toBe(1);
    });
  });
});
