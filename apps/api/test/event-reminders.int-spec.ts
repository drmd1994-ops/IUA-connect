import { JobQueue } from '../src/infra/jobs/job-queue';
import { EVENT_REMINDERS_JOB, EventRemindersJob } from '../src/modules/events/reminders.job';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M5 checkpoint 6: reminder emails, and emails when an event is cancelled or moved. */
describe('event reminders and change emails (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let job: EventRemindersJob;
  const run = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const as = () => bearer(admin.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    job = h.app.get(EventRemindersJob);
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  /** A published event starting `daysAhead` days from now. */
  async function event(daysAhead: number, extra: Record<string, unknown> = {}) {
    const startAt = new Date(Date.now() + daysAhead * DAY);
    const body = {
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 4 * HOUR).toISOString(),
      locationName: 'Example Hall',
      registrationMode: 'INTERNAL',
      translations: { he: { title: `אירוע לתזכורת ${run} ${++n}` } },
      ...extra,
    };
    const created = await h.http().post('/api/v1/admin/events').set(as()).send(body).expect(201);
    await h.http().post(`/api/v1/admin/events/${created.body.id}/publish`).set(as()).expect(200);
    return { id: created.body.id as string, slug: created.body.slug as string, startAt, body };
  }
  /** Registers a new person; `longAgo` backdates it, as if they registered weeks earlier. */
  async function attendee(e: { id: string; slug: string }, longAgo = true) {
    const email = await createVerifiedUser(h, 'attendee');
    const token = (await signIn(h, email)).accessToken;
    const res = await h
      .http()
      .post(`/api/v1/events/${encodeURIComponent(e.slug)}/registration`)
      .set(bearer(token))
      .expect(200);
    if (longAgo) {
      await h.db.query(
        `UPDATE event_registrations SET queued_at = now() - interval '30 days'
          WHERE event_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [e.id, email],
      );
    }
    return { email, token, status: res.body.status as string };
  }
  const reminders = (email: string) => h.mailer.count(email, 'eventReminder');

  it('sends the week reminder once, then the day reminder once', async () => {
    const e = await event(3);
    const p = await attendee(e);
    await job.run();
    expect(reminders(p.email)).toBe(1);
    expect(h.mailer.last(p.email, 'eventReminder')?.params).toMatchObject({
      place: 'Example Hall',
      link: expect.stringContaining('/events/'),
    });
    // Running again, or a moment later, sends nothing more.
    await job.run();
    await job.run(new Date(Date.now() + HOUR));
    expect(reminders(p.email)).toBe(1);

    // Two hours before the start: the day reminder, once.
    const nearStart = new Date(e.startAt.getTime() - 2 * HOUR);
    await job.run(nearStart);
    await job.run(nearStart);
    expect(reminders(p.email)).toBe(2);
    // After the start: nothing.
    await job.run(new Date(e.startAt.getTime() + HOUR));
    expect(reminders(p.email)).toBe(2);

    const log = await h.db.query(
      'SELECT kind FROM event_reminders WHERE event_id = $1 ORDER BY sent_at',
      [e.id],
    );
    expect(log.rows.map((r: { kind: string }) => r.kind)).toEqual(['WEEK', 'DAY']);
  });

  it('sends nothing more than a week ahead, and no reminder that predates the registration', async () => {
    const far = await event(20);
    const early = await attendee(far);
    await job.run();
    expect(reminders(early.email)).toBe(0);

    // Registered today for an event in 3 days: the week reminder's time has passed.
    const soon = await event(3);
    const fresh = await attendee(soon, false);
    await job.run();
    expect(reminders(fresh.email)).toBe(0);
    await job.run(new Date(soon.startAt.getTime() - 2 * HOUR));
    expect(reminders(fresh.email)).toBe(1);
  });

  it('reminds only people who hold a place, and nobody for a cancelled event', async () => {
    const e = await event(3, { capacity: 1 });
    const registered = await attendee(e);
    const waiting = await attendee(e);
    expect(waiting.status).toBe('WAITLISTED');
    const gone = await event(3);
    const cancelledRegistration = await attendee(gone);
    await h
      .http()
      .delete(`/api/v1/events/${encodeURIComponent(gone.slug)}/registration`)
      .set(bearer(cancelledRegistration.token))
      .expect(200);

    const off = await event(3);
    const unlucky = await attendee(off);
    await h
      .http()
      .post(`/api/v1/admin/events/${off.id}/cancel`)
      .set(as())
      .send({ reason: 'The venue is closed' })
      .expect(200);

    await job.run();
    expect(reminders(registered.email)).toBe(1);
    expect(reminders(waiting.email)).toBe(0);
    expect(reminders(cancelledRegistration.email)).toBe(0);
    expect(reminders(unlucky.email)).toBe(0);
    // The cancellation itself was emailed, with the reason.
    expect(h.mailer.last(unlucky.email, 'eventCancelled')?.params).toMatchObject({
      reason: 'The venue is closed',
    });
  });

  it('emails people who hold a place or are waiting when the event is cancelled', async () => {
    const e = await event(10, { capacity: 1 });
    const registered = await attendee(e);
    const waiting = await attendee(e);
    const left = await attendee(await event(10));
    await h
      .http()
      .post(`/api/v1/admin/events/${e.id}/cancel`)
      .set(as())
      .send({ reason: 'Postponed' })
      .expect(200);
    expect(h.mailer.count(registered.email, 'eventCancelled')).toBe(1);
    expect(h.mailer.count(waiting.email, 'eventCancelled')).toBe(1);
    expect(h.mailer.count(left.email, 'eventCancelled')).toBe(0);
  });

  it('emails registrants when the time or the place changes, not for other edits', async () => {
    const e = await event(10);
    const p = await attendee(e);
    const save = async (change: Record<string, unknown>) => {
      const current = await h.http().get(`/api/v1/admin/events/${e.id}`).set(as()).expect(200);
      await h
        .http()
        .put(`/api/v1/admin/events/${e.id}`)
        .set(as())
        .set('If-Match', `"${current.body.version}"`)
        .send({ ...e.body, ...change })
        .expect(200);
    };
    await save({ organizer: 'IUA' });
    expect(h.mailer.count(p.email, 'eventChanged')).toBe(0);
    await save({ organizer: 'IUA', locationName: 'Another Hall' });
    expect(h.mailer.count(p.email, 'eventChanged')).toBe(1);
    expect(h.mailer.last(p.email, 'eventChanged')?.params).toMatchObject({ place: 'Another Hall' });
    const later = new Date(e.startAt.getTime() + HOUR).toISOString();
    await save({ organizer: 'IUA', locationName: 'Another Hall', startAt: later });
    expect(h.mailer.count(p.email, 'eventChanged')).toBe(2);
  });

  it('is registered with the job queue', async () => {
    const e = await event(3);
    const p = await attendee(e);
    await h.app.get(JobQueue).runNow(EVENT_REMINDERS_JOB);
    expect(reminders(p.email)).toBe(1);
  });
});
