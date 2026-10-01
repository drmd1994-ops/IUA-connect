import {
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M5 checkpoint 4: calendar (ICS) files for an event and for the personal schedule. */
describe('event calendar files (integration)', () => {
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

  /** Unfolds a calendar file and returns its entries as property maps. */
  function entries(ics: string): Record<string, string>[] {
    const found: Record<string, string>[] = [];
    let current: Record<string, string> | null = null;
    for (const line of ics.replace(/\r\n[ \t]/g, '').split('\r\n')) {
      if (line === 'BEGIN:VEVENT') current = {};
      else if (line === 'END:VEVENT') found.push(current!);
      else if (current)
        current[line.slice(0, line.indexOf(':'))] = line.slice(line.indexOf(':') + 1);
    }
    return found;
  }

  let n = 0;
  async function event(extra: Record<string, unknown> = {}, publish = true) {
    const title = `כנס, לוח שנה ${run} ${++n}`;
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as())
      .send({
        startAt: at(7),
        endAt: at(16),
        locationName: 'מרכז כנסים לדוגמה',
        address: 'רחוב הדוגמה 1, אילת',
        lat: 29.5577,
        lng: 34.9519,
        registrationMode: 'INTERNAL',
        translations: { he: { title, summary: 'תקציר האירוע' } },
        ...extra,
      })
      .expect(201);
    if (publish) {
      await h.http().post(`/api/v1/admin/events/${created.body.id}/publish`).set(as()).expect(200);
    }
    return { id: created.body.id as string, slug: created.body.slug as string, title };
  }
  const session = async (eventId: string, from: number, to: number, title: string) =>
    (
      await h
        .http()
        .post(`/api/v1/admin/events/${eventId}/sessions`)
        .set(as())
        .send({ startAt: at(from), endAt: at(to), room: 'אולם ב', translations: { he: { title } } })
        .expect(201)
    ).body.id as string;
  const icsOf = (slug: string) => `/api/v1/events/${encodeURIComponent(slug)}.ics`;

  it('serves a public event as a calendar file anyone can download', async () => {
    const e = await event();
    const res = await h.http().get(icsOf(e.slug)).expect(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="event.ics"');
    expect(res.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(res.text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of res.text.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    const [entry, ...rest] = entries(res.text);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      UID: `event-${e.id}@iua-connect`,
      DTSTART: '20300110T070000Z',
      DTEND: '20300110T160000Z',
      SUMMARY: e.title.replace(',', '\\,'),
      DESCRIPTION: 'תקציר האירוע',
      LOCATION: 'מרכז כנסים לדוגמה\\, רחוב הדוגמה 1\\, אילת',
      GEO: '29.5577;34.9519',
      STATUS: 'CONFIRMED',
    });
    // A link is written percent-encoded, as addresses are.
    expect(entry!.URL).toContain(`/he/events/${encodeURIComponent(e.slug)}`);

    // The event's own page still answers at the plain address.
    await h
      .http()
      .get(`/api/v1/events/${encodeURIComponent(e.slug)}`)
      .expect(200);
  });

  it('keeps the same ID across downloads and marks a cancelled event', async () => {
    const e = await event();
    const before = entries((await h.http().get(icsOf(e.slug)).expect(200)).text)[0]!;
    await h
      .http()
      .post(`/api/v1/admin/events/${e.id}/cancel`)
      .set(as())
      .send({ reason: 'Test' })
      .expect(200);
    const after = entries((await h.http().get(icsOf(e.slug)).expect(200)).text)[0]!;
    expect(after.UID).toBe(before.UID);
    expect(after.STATUS).toBe('CANCELLED');
  });

  it('hides the calendar file of a draft or members-only event', async () => {
    const draft = await event({}, false);
    await h.http().get(icsOf(draft.slug)).expect(404);
    const members = await event({ accessTier: 'MEMBERS' });
    await h.http().get(icsOf(members.slug)).expect(404);
    await h.http().get(icsOf('no-such-event')).expect(404);
  });

  it('builds the personal schedule: chosen sessions, or the whole event when none was chosen', async () => {
    const withSessions = await event();
    const whole = await event();
    const waiting = await event({ capacity: 1 });
    const first = await session(withSessions.id, 8, 9, `מושב פתיחה ${run}`);
    const second = await session(withSessions.id, 11, 12, `מושב שני ${run}`);
    await session(withSessions.id, 13, 14, `מושב שלא נבחר ${run}`);

    const email = await createVerifiedUser(h, 'attendee');
    const token = (await signIn(h, email)).accessToken;
    const other = (await signIn(h, await createVerifiedUser(h, 'attendee'))).accessToken;
    const register = (slug: string, who: string) =>
      h
        .http()
        .post(`/api/v1/events/${encodeURIComponent(slug)}/registration`)
        .set(bearer(who))
        .expect(200);
    await register(withSessions.slug, token);
    await register(whole.slug, token);
    await register(waiting.slug, other);
    expect((await register(waiting.slug, token)).body.status).toBe('WAITLISTED');
    await h
      .http()
      .put(`/api/v1/events/${encodeURIComponent(withSessions.slug)}/schedule`)
      .set(bearer(token))
      .send({ sessionIds: [second, first] })
      .expect(200);

    await h.http().get('/api/v1/me/schedule.ics').expect(401);
    const res = await h.http().get('/api/v1/me/schedule.ics').set(bearer(token)).expect(200);
    expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="my-schedule.ics"');
    const found = entries(res.text);
    expect(found.map((entry) => entry.UID).sort()).toEqual(
      [
        `session-${first}@iua-connect`,
        `session-${second}@iua-connect`,
        `event-${whole.id}@iua-connect`,
      ].sort(),
    );
    const opening = found.find((entry) => entry.UID === `session-${first}@iua-connect`)!;
    expect(opening).toMatchObject({ DTSTART: '20300110T080000Z', DTEND: '20300110T090000Z' });
    expect(opening.SUMMARY).toContain(`מושב פתיחה ${run}`);
    expect(opening.LOCATION).toContain('אולם ב');
    // The event the person is only waiting for is not in their calendar.
    expect(res.text).not.toContain(waiting.id);

    // The plain schedule still answers next to the file.
    const json = await h.http().get('/api/v1/me/schedule').set(bearer(token)).expect(200);
    expect(json.body.items).toHaveLength(3);
  });
});
