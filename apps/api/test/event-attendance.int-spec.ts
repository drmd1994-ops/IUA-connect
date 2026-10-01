import { CheckInTokens } from '../src/modules/events/check-in-token';
import { csvCell } from '../src/modules/events/attendance.service';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  expectAdminOnly,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M5 checkpoint 5: attendance by a QR code shown at the venue, and by hand. */
describe('event attendance (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  const run = Date.now();
  const at = (hour: number) => new Date(Date.UTC(2030, 0, 10, hour)).toISOString();
  const as = () => bearer(admin.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  async function event(extra: Record<string, unknown> = {}, publish = true) {
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as())
      .send({
        startAt: at(7),
        endAt: at(16),
        registrationMode: 'INTERNAL',
        translations: { he: { title: `אירוע לנוכחות ${run} ${++n}` } },
        ...extra,
      })
      .expect(201);
    if (publish) {
      await h.http().post(`/api/v1/admin/events/${created.body.id}/publish`).set(as()).expect(200);
    }
    return { id: created.body.id as string, slug: created.body.slug as string };
  }
  const session = async (eventId: string) =>
    (
      await h
        .http()
        .post(`/api/v1/admin/events/${eventId}/sessions`)
        .set(as())
        .send({
          startAt: at(8),
          endAt: at(9),
          translations: { he: { title: `מושב ${run} ${++n}` } },
        })
        .expect(201)
    ).body.id as string;
  async function person(registerFor?: { slug: string }) {
    const email = await createVerifiedUser(h, 'attendee');
    const token = (await signIn(h, email)).accessToken;
    if (registerFor) {
      await h
        .http()
        .post(`/api/v1/events/${encodeURIComponent(registerFor.slug)}/registration`)
        .set(bearer(token))
        .expect(200);
    }
    return { email, token };
  }
  const admin_ = (id: string, tail = '') => `/api/v1/admin/events/${id}/attendance${tail}`;
  /** The code the admin's screen would show, read from its address. */
  async function code(eventId: string, sessionId?: string): Promise<string> {
    const res = await h
      .http()
      .get(admin_(eventId, `/code${sessionId ? `?sessionId=${sessionId}` : ''}`))
      .set(as())
      .expect(200);
    return new URL(res.body.url).searchParams.get('t')!;
  }
  const checkIn = (e: { slug: string }, token: string, t: string) =>
    h
      .http()
      .post(`/api/v1/events/${encodeURIComponent(e.slug)}/check-in`)
      .set(bearer(token))
      .send({ token: t });

  it('is for event admins only, and check-in needs a signed-in account', async () => {
    const e = await event();
    const p = await person(e);
    const made = await h.http().post(admin_(e.id)).set(as()).send({ email: p.email }).expect(201);
    await expectAdminOnly(h, 'get', admin_(e.id));
    await expectAdminOnly(h, 'get', admin_(e.id, '/code'));
    await expectAdminOnly(h, 'get', `/api/v1/admin/events/${e.id}/attendance.csv`);
    await expectAdminOnly(h, 'post', admin_(e.id), { email: p.email });
    await expectAdminOnly(h, 'post', admin_(e.id, `/${made.body.id}/void`), { reason: 'x' });
    await h
      .http()
      .post(`/api/v1/events/${encodeURIComponent(e.slug)}/check-in`)
      .send({ token: 'x'.repeat(40) })
      .expect(401);
  });

  it('gives a code whose address opens the check-in page, valid for five minutes', async () => {
    const e = await event();
    const res = await h.http().get(admin_(e.id, '/code?locale=en')).set(as()).expect(200);
    const url = new URL(res.body.url);
    expect(decodeURIComponent(url.pathname)).toBe(`/en/events/${e.slug}/check-in`);
    const ttl = Date.parse(res.body.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);

    const draft = await event({}, false);
    const closed = await h.http().get(admin_(draft.id, '/code')).set(as()).expect(422);
    expect(closed.body.error.details[0].code).toBe('checkInClosed');
    const other = await event();
    const foreign = await session(other.id);
    await h
      .http()
      .get(admin_(e.id, `/code?sessionId=${foreign}`))
      .set(as())
      .expect(400);
  });

  it('records a registered member who scans the code, once', async () => {
    const e = await event();
    const p = await person(e);
    const t = await code(e.id);
    const first = await checkIn(e, p.token, t).expect(200);
    expect(first.body).toMatchObject({ recorded: true, sessionId: null });
    // Scanning again is harmless.
    const again = await checkIn(e, p.token, t).expect(200);
    expect(again.body).toMatchObject({ recorded: false, at: first.body.at });

    const list = await h.http().get(admin_(e.id)).set(as()).expect(200);
    expect(list.body).toMatchObject({ attendees: 1, total: 1 });
    expect(list.body.items[0]).toMatchObject({ email: p.email, method: 'QR', voidedAt: null });
  });

  it('records sessions separately from the event', async () => {
    const e = await event();
    const s = await session(e.id);
    const p = await person(e);
    expect((await checkIn(e, p.token, await code(e.id, s)).expect(200)).body).toMatchObject({
      recorded: true,
      sessionId: s,
    });
    expect((await checkIn(e, p.token, await code(e.id)).expect(200)).body.recorded).toBe(true);
    const all = await h.http().get(admin_(e.id)).set(as()).expect(200);
    expect(all.body).toMatchObject({ attendees: 1, total: 2 });
    const one = await h
      .http()
      .get(admin_(e.id, `?sessionId=${s}`))
      .set(as())
      .expect(200);
    expect(one.body.total).toBe(1);
  });

  it('refuses expired, altered and foreign codes, and other kinds of token', async () => {
    const e = await event();
    const other = await event();
    const p = await person(e);
    const invalid = async (t: string) => {
      const res = await checkIn(e, p.token, t).expect(422);
      expect(res.body.error.details[0].code).toBe('checkInCodeInvalid');
    };
    const good = await code(e.id);
    await invalid(`${good.slice(0, -4)}AAAA`);
    await invalid(await code(other.id));
    await invalid(p.token); // an access token is not a check-in code
    const tokens = h.app.get(CheckInTokens);
    const old = await tokens.issue(
      { eventId: e.id, sessionId: null },
      new Date(Date.now() - 6 * 60_000),
    );
    await invalid(old.token);
    // A code naming a session of another event.
    const foreign = await tokens.issue({ eventId: e.id, sessionId: await session(other.id) });
    await invalid(foreign.token);
    // The good code still works afterwards.
    await checkIn(e, p.token, good).expect(200);
  });

  it('records only people who may attend', async () => {
    const e = await event({ capacity: 1 });
    const registered = await person(e);
    const waiting = await person(e);
    const stranger = await person();
    const t = await code(e.id);
    for (const p of [waiting, stranger]) {
      const res = await checkIn(e, p.token, t).expect(422);
      expect(res.body.error.details[0].code).toBe('checkInNotRegistered');
    }
    await checkIn(e, registered.token, t).expect(200);

    // Without in-app registration, anyone who may see the event can be recorded.
    const open = await event({ registrationMode: 'NONE' });
    await checkIn(open, stranger.token, await code(open.id)).expect(200);
    // A members-only event is hidden from non-members, code or not.
    const members = await event({ registrationMode: 'NONE', accessTier: 'MEMBERS' });
    await checkIn(members, stranger.token, await code(members.id)).expect(404);

    // A cancelled event records nobody.
    const cancelled = await event();
    const late = await person(cancelled);
    const before = await code(cancelled.id);
    await h
      .http()
      .post(`/api/v1/admin/events/${cancelled.id}/cancel`)
      .set(as())
      .send({ reason: 'Test' })
      .expect(200);
    const res = await checkIn(cancelled, late.token, before).expect(422);
    expect(res.body.error.details[0].code).toBe('checkInClosed');
  });

  it('marks people by hand, voids a wrong record, and lets it be recorded again', async () => {
    const e = await event();
    const p = await person();
    const post = (body: object) => h.http().post(admin_(e.id)).set(as()).send(body);
    const unknown = await post({ email: `nobody-${run}@example.test` }).expect(400);
    expect(unknown.body.error.details[0].code).toBe('unknownAccount');

    const made = await post({ email: p.email }).expect(201);
    expect(made.body).toMatchObject({ email: p.email, method: 'MANUAL', voidedAt: null });
    const twice = await post({ email: p.email }).expect(409);
    expect(twice.body.error.details[0].code).toBe('attendanceAlreadyRecorded');

    const voidIt = (body: object) =>
      h
        .http()
        .post(admin_(e.id, `/${made.body.id}/void`))
        .set(as())
        .send(body);
    await voidIt({ reason: '' }).expect(400);
    const voided = await voidIt({ reason: 'Wrong person' }).expect(200);
    expect(voided.body.voidReason).toBe('Wrong person');
    expect(voided.body.voidedAt).not.toBeNull();
    const again = await voidIt({ reason: 'x' }).expect(422);
    expect(again.body.error.details[0].code).toBe('attendanceAlreadyVoided');

    // The voided record stays in the list; the person no longer counts, and can be re-recorded.
    const list = await h.http().get(admin_(e.id)).set(as()).expect(200);
    expect(list.body).toMatchObject({ attendees: 0, total: 1 });
    await post({ email: p.email }).expect(201);
    expect((await h.http().get(admin_(e.id)).set(as())).body).toMatchObject({
      attendees: 1,
      total: 2,
    });
    const audit = await h.db.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'event' AND entity_id = $1
        AND action LIKE 'event.attendance.%' ORDER BY at`,
      [e.id],
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual([
      'event.attendance.record',
      'event.attendance.void',
      'event.attendance.record',
    ]);
  });

  it('exports the records as CSV that a spreadsheet reads safely', async () => {
    const e = await event();
    const s = await session(e.id);
    const p = await person(e);
    await checkIn(e, p.token, await code(e.id, s)).expect(200);
    const res = await h
      .http()
      .get(`/api/v1/admin/events/${e.id}/attendance.csv`)
      .set(as())
      .expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="attendance.csv"');
    const lines = res.text.replace(String.fromCharCode(0xfeff), '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      '"name","email","session","method","recorded_at","voided_at","void_reason"',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"${p.email}"`);
    expect(lines[1]).toContain('"QR"');
    expect(lines[1]).toContain(`מושב ${run}`);
    // Cells that look like formulas are made harmless.
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('plain, "quoted"')).toBe('"plain, ""quoted"""');
  });

  it('keeps attendance append-only at the database level', async () => {
    const e = await event();
    const p = await person();
    const made = await h.http().post(admin_(e.id)).set(as()).send({ email: p.email }).expect(201);
    const id = made.body.id as string;
    await expect(h.db.query('DELETE FROM event_attendance WHERE id = $1', [id])).rejects.toThrow(
      /append-only/,
    );
    await expect(
      h.db.query('UPDATE event_attendance SET at = now() WHERE id = $1', [id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      h.db.query(`UPDATE event_attendance SET method = 'QR', recorded_by = NULL WHERE id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/append-only/);
    // Voiding is the one change allowed, and only once.
    await h
      .http()
      .post(admin_(e.id, `/${id}/void`))
      .set(as())
      .send({ reason: 'Test' })
      .expect(200);
    await expect(
      h.db.query(`UPDATE event_attendance SET void_reason = 'changed' WHERE id = $1`, [id]),
    ).rejects.toThrow(/append-only/);
  });
});
