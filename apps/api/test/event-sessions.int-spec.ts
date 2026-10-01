import {
  type Harness,
  bearer,
  expectAdminOnly,
  grantRole,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M5 checkpoint 2: sessions, speakers and session materials. Speakers here are made up. */
describe('event sessions and speakers (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  const run = Date.now();
  const at = (hour: number, day = 10) => new Date(Date.UTC(2030, 0, day, hour)).toISOString();
  const as = () => bearer(admin.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  async function event(options: { publish?: boolean; tier?: string; dates?: boolean } = {}) {
    const created = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as())
      .send({
        ...(options.dates === false ? {} : { startAt: at(7), endAt: at(16) }),
        accessTier: options.tier ?? 'PUBLIC',
        translations: { he: { title: `אירוע עם מושבים ${run} ${++n}` } },
      })
      .expect(201);
    if (options.publish) {
      await h.http().post(`/api/v1/admin/events/${created.body.id}/publish`).set(as()).expect(200);
    }
    return created.body as { id: string; slug: string; version: number };
  }
  const speaker = async (name: string, extra: object = {}) =>
    (
      await h
        .http()
        .post('/api/v1/admin/speakers')
        .set(as())
        .send({ translations: { he: { name, affiliation: 'מרכז רפואי לדוגמה' } }, ...extra })
        .expect(201)
    ).body as { id: string; sessionCount: number };
  const session = (extra: object = {}) => ({
    startAt: at(8),
    endAt: at(9),
    room: 'אולם א',
    translations: { he: { title: `מושב ${run} ${++n}`, description: 'תיאור' } },
    ...extra,
  });
  const sessionsOf = (id: string) => `/api/v1/admin/events/${id}/sessions`;

  it('is for event admins only', async () => {
    const e = await event();
    const s = await h.http().post(sessionsOf(e.id)).set(as()).send(session()).expect(201);
    const sp = await speaker(`מרצה בדוי ${run}`);
    await expectAdminOnly(h, 'get', sessionsOf(e.id));
    await expectAdminOnly(h, 'post', sessionsOf(e.id), session());
    await expectAdminOnly(h, 'put', `${sessionsOf(e.id)}/${s.body.id}`, session());
    await expectAdminOnly(h, 'delete', `${sessionsOf(e.id)}/${s.body.id}`);
    await expectAdminOnly(h, 'get', '/api/v1/admin/speakers');
    await expectAdminOnly(h, 'post', '/api/v1/admin/speakers', {
      translations: { he: { name: 'x' } },
    });
    await expectAdminOnly(h, 'put', `/api/v1/admin/speakers/${sp.id}`, {
      translations: { he: { name: 'x' } },
    });
    await expectAdminOnly(h, 'delete', `/api/v1/admin/speakers/${sp.id}`);
  });

  it('keeps sessions inside their event', async () => {
    const e = await event();
    const post = (extra: object) => h.http().post(sessionsOf(e.id)).set(as()).send(session(extra));
    const early = await post({ startAt: at(6), endAt: at(8) }).expect(400);
    expect(early.body.error.details[0].code).toBe('sessionOutsideEvent');
    await post({ startAt: at(15), endAt: at(17) }).expect(400);
    await post({ startAt: at(9), endAt: at(8) }).expect(400);
    await post({ translations: {} }).expect(400);
    await post({ startAt: at(7), endAt: at(16) }).expect(201);

    const noDates = await event({ dates: false });
    const res = await h.http().post(sessionsOf(noDates.id)).set(as()).send(session()).expect(422);
    expect(res.body.error.details[0].code).toBe('eventDatesRequired');
  });

  it('refuses event dates that would leave a session outside', async () => {
    const e = await event();
    await h.http().post(sessionsOf(e.id)).set(as()).send(session()).expect(201);
    const put = (startAt: string, endAt: string) =>
      h
        .http()
        .put(`/api/v1/admin/events/${e.id}`)
        .set(as())
        .set('If-Match', '"1"')
        .send({ startAt, endAt, translations: { he: { title: `אירוע ${run} שהוזז` } } });
    const res = await put(at(10), at(16)).expect(400);
    expect(res.body.error.details[0].code).toBe('eventSessionsOutside');
    await put(at(8), at(12)).expect(200);
  });

  it('manages speakers, and won’t delete one who is named in a session', async () => {
    const first = await speaker(`ד״ר בדויה ראשונה ${run}`, {
      translations: {
        he: { name: `בדויה ראשונה ${run}`, title: 'ד״ר' },
        en: { name: `Fictional First ${run}`, title: 'Dr.', bio: 'A made-up speaker.' },
      },
    });
    const second = await speaker(`בדוי שני ${run}`);
    const unknown = await h
      .http()
      .post('/api/v1/admin/speakers')
      .set(as())
      .send({
        photoFileId: '018f0000-0000-7000-8000-000000000000',
        translations: { he: { name: 'x' } },
      })
      .expect(400);
    expect(unknown.body.error.details[0].code).toBe('unknownImage');

    const e = await event();
    const created = await h
      .http()
      .post(sessionsOf(e.id))
      .set(as())
      .send(session({ speakerIds: [second.id, first.id] }))
      .expect(201);
    // The order given is the order kept.
    expect(created.body.speakerIds).toEqual([second.id, first.id]);

    const list = await h
      .http()
      .get(`/api/v1/admin/speakers?q=${encodeURIComponent(String(run))}`)
      .set(as())
      .expect(200);
    const listed = list.body.items as { id: string; sessionCount: number }[];
    expect(listed.find((s) => s.id === first.id)?.sessionCount).toBe(1);

    const inUse = await h.http().delete(`/api/v1/admin/speakers/${first.id}`).set(as()).expect(422);
    expect(inUse.body.error.details[0].code).toBe('speakerInUse');

    const noSpeaker = await h
      .http()
      .post(sessionsOf(e.id))
      .set(as())
      .send(session({ speakerIds: ['018f0000-0000-7000-8000-000000000000'] }))
      .expect(400);
    expect(noSpeaker.body.error.details[0].code).toBe('unknownSpeaker');

    await h
      .http()
      .put(`${sessionsOf(e.id)}/${created.body.id}`)
      .set(as())
      .send(session({ speakerIds: [second.id] }))
      .expect(200);
    await h.http().delete(`/api/v1/admin/speakers/${first.id}`).set(as()).expect(204);
  });

  it('shows the sessions of a public event in order, with speakers and materials', async () => {
    const e = await event({ publish: true });
    const who = await speaker(`מרצה ${run}`, {
      translations: {
        he: { name: `מרצה בדוי ${run}`, title: 'פרופ׳' },
        en: { name: `Fictional Speaker ${run}`, title: 'Prof.' },
      },
    });
    const file = await h
      .http()
      .post('/api/v1/files')
      .set(as())
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'slides.pdf')
      .expect(201);
    const later = session({ startAt: at(11), endAt: at(12) });
    const sooner = session({
      startAt: at(8),
      endAt: at(9),
      speakerIds: [who.id],
      materialFileIds: [file.body.id],
    });
    await h.http().post(sessionsOf(e.id)).set(as()).send(later).expect(201);
    await h.http().post(sessionsOf(e.id)).set(as()).send(sooner).expect(201);

    const path = `/api/v1/events/${encodeURIComponent(e.slug)}/sessions`;
    const res = await h.http().get(`${path}?locale=en`).expect(200);
    expect(res.body.items.map((s: { title: string }) => s.title)).toEqual([
      sooner.translations.he.title,
      later.translations.he.title,
    ]);
    expect(res.body.items[0]).toMatchObject({
      room: 'אולם א',
      locale: 'he', // the session has no English text
      speakers: [{ name: `Fictional Speaker ${run}`, title: 'Prof.' }],
      materials: [{ id: file.body.id, originalName: 'slides.pdf' }],
    });
    // The material follows the event: anyone may read it while the event is public.
    await h.http().get(`/api/v1/files/${file.body.id}/url`).expect(200);
  });

  it('hides the sessions and materials of a draft or members-only event', async () => {
    const file = await h
      .http()
      .post('/api/v1/files')
      .set(as())
      .attach('file', Buffer.from('%PDF-1.4\n%%EOF\n'), 'members.pdf')
      .expect(201);
    const draft = await event();
    await h
      .http()
      .get(`/api/v1/events/${encodeURIComponent(draft.slug)}/sessions`)
      .expect(404);

    const members = await event({ publish: true, tier: 'MEMBERS' });
    await h
      .http()
      .post(sessionsOf(members.id))
      .set(as())
      .send(session({ materialFileIds: [file.body.id] }))
      .expect(201);
    await h
      .http()
      .get(`/api/v1/events/${encodeURIComponent(members.slug)}/sessions`)
      .expect(404);
    await h.http().get(`/api/v1/files/${file.body.id}/url`).expect(404);
  });

  it('closes the sessions of a cancelled event to changes', async () => {
    const e = await event({ publish: true });
    const s = await h.http().post(sessionsOf(e.id)).set(as()).send(session()).expect(201);
    await h
      .http()
      .post(`/api/v1/admin/events/${e.id}/cancel`)
      .set(as())
      .send({ reason: 'Test' })
      .expect(200);
    const res = await h.http().post(sessionsOf(e.id)).set(as()).send(session()).expect(422);
    expect(res.body.error.details[0].code).toBe('eventCancelled');
    await h
      .http()
      .delete(`${sessionsOf(e.id)}/${s.body.id}`)
      .set(as())
      .expect(422);
    // Readers still see what was planned.
    const list = await h
      .http()
      .get(`/api/v1/events/${encodeURIComponent(e.slug)}/sessions`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });
});
