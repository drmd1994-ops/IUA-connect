import sharp from 'sharp';
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

/** M5 checkpoint 1: event management and public events under the access tiers. */
describe('events (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let types: Record<string, string>;
  const run = Date.now();
  const future = (days: number, hour = 7) =>
    new Date(Date.UTC(2030, 0, 1 + days, hour)).toISOString();

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInWithMfa(h, 'event-admin', (email) => grantRole(h, email, 'EVENT_ADMIN'));
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
  });

  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  const input = (extra: object = {}) => ({
    startAt: future(10),
    endAt: future(10, 15),
    locationName: 'Example Conference Centre',
    registrationMode: 'INTERNAL',
    translations: { he: { title: `אירוע לדוגמה ${run} ${++n}`, description: 'פרטים.' } },
    ...extra,
  });
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  const create = async (extra: object = {}) =>
    (await h.http().post('/api/v1/admin/events').set(as(admin)).send(input(extra)).expect(201))
      .body as { id: string; slug: string; version: number; status: string };
  const publish = (id: string) =>
    h.http().post(`/api/v1/admin/events/${id}/publish`).set(as(admin));
  const published = async (extra: object = {}) => {
    const event = await create(extra);
    await publish(event.id).expect(200);
    return event;
  };
  const read = (token: string | null, path: string) => {
    const req = h.http().get(path);
    return token ? req.set(bearer(token)) : req;
  };

  it('is for event admins only: not members, not content editors', async () => {
    const event = await create();
    await expectAdminOnly(h, 'get', '/api/v1/admin/events');
    await expectAdminOnly(h, 'post', '/api/v1/admin/events', input());
    await expectAdminOnly(h, 'get', `/api/v1/admin/events/${event.id}`);
    await expectAdminOnly(h, 'put', `/api/v1/admin/events/${event.id}`, input());
    await expectAdminOnly(h, 'post', `/api/v1/admin/events/${event.id}/publish`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/events/${event.id}/cancel`, { reason: 'x' });
    await expectAdminOnly(h, 'delete', `/api/v1/admin/events/${event.id}`);
    await expectAdminOnly(h, 'get', '/api/v1/admin/events/categories');
    await expectAdminOnly(h, 'post', '/api/v1/admin/events/categories', {
      key: `c_${run}`,
      nameHe: 'x',
      nameEn: 'x',
    });

    const editor = await signInWithMfa(h, 'editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR'),
    );
    await h.http().get('/api/v1/admin/events').set(as(editor)).expect(403);
    // An IUA admin holds events.manage too.
    const iuaAdmin = await signInAdmin(h, 'iua-admin');
    await h.http().get('/api/v1/admin/events').set(as(iuaAdmin)).expect(200);
  });

  it('creates a draft with cleaned text, a Hebrew URL name and an audit entry', async () => {
    const res = await h
      .http()
      .post('/api/v1/admin/events')
      .set(as(admin))
      .send(
        input({
          capacity: 40,
          lat: 29.5577,
          lng: 34.9519,
          translations: {
            he: {
              title: `כנס לדוגמה ${run}`,
              description: 'טקסט <script>alert(1)</script>**מודגש**',
            },
          },
        }),
      )
      .expect(201);
    expect(res.headers.etag).toBe('"1"');
    expect(res.body).toMatchObject({
      status: 'DRAFT',
      slug: `כנס-לדוגמה-${run}`,
      capacity: 40,
      lat: 29.5577,
      lng: 34.9519,
      timezone: 'Asia/Jerusalem',
      accessTier: 'PUBLIC',
      version: 1,
    });
    expect(res.body.translations.he.description).not.toContain('script');
    expect(res.body.translations.he.description).toContain('**מודגש**');
    // A draft is not public.
    await read(null, `/api/v1/events/${encodeURIComponent(res.body.slug)}`).expect(404);
    const audit = await h.db.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'event' AND entity_id = $1`,
      [res.body.id],
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual(['event.create']);
  });

  it('validates dates, coordinates, links, tiers and images', async () => {
    const post = (extra: object) =>
      h.http().post('/api/v1/admin/events').set(as(admin)).send(input(extra));
    await post({ endAt: future(9) }).expect(400);
    await post({ lat: 31.5 }).expect(400);
    await post({ registrationMode: 'EXTERNAL', registrationUrl: 'javascript:alert(1)' }).expect(
      400,
    );
    const noUrl = await post({ registrationMode: 'EXTERNAL' }).expect(400);
    expect(noUrl.body.error.details[0].code).toBe('eventRegistrationUrlRequired');
    await post({ accessTier: 'TYPES' }).expect(400);
    await post({ translations: {} }).expect(400);
    await post({ capacity: 0 }).expect(400);
    const image = await post({ imageFileId: '018f0000-0000-7000-8000-000000000000' }).expect(400);
    expect(image.body.error.details[0].code).toBe('unknownImage');
  });

  it('saves only with the current version (If-Match)', async () => {
    const event = await create();
    const put = (version: string | null) => {
      const req = h.http().put(`/api/v1/admin/events/${event.id}`).set(as(admin));
      return (version ? req.set('If-Match', version) : req).send(input({ organizer: 'IUA' }));
    };
    await put(null).expect(412);
    await put('"7"').expect(412);
    const saved = await put('"1"').expect(200);
    expect(saved.body).toMatchObject({ organizer: 'IUA', version: 2 });
    await put('"1"').expect(412);
  });

  it('publishes a complete draft, and says what is missing otherwise', async () => {
    const noDates = await create({ startAt: null, endAt: null });
    const first = await publish(noDates.id).expect(422);
    expect(first.body.error.details[0].code).toBe('eventDatesRequired');

    const english = await create({ translations: { en: { title: `English only ${run}` } } });
    const second = await publish(english.id).expect(422);
    expect(second.body.error.details[0].code).toBe('eventHebrewRequired');

    const event = await create();
    const done = await publish(event.id).expect(200);
    expect(done.body).toMatchObject({ status: 'PUBLISHED' });
    expect(done.body.publishedAt).not.toBeNull();
    const again = await publish(event.id).expect(422);
    expect(again.body.error.details[0].code).toBe('eventNotDraft');
  });

  it('shows a published event to everyone, with the Hebrew fallback and its image', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#036' } })
      .png()
      .toBuffer();
    const file = await h
      .http()
      .post('/api/v1/files')
      .set(as(admin))
      .attach('file', png, 'venue.png')
      .expect(201);
    const title = `כנס עם תמונה ${run}`;
    const event = await published({
      imageFileId: file.body.id,
      registrationMode: 'EXTERNAL',
      registrationUrl: 'https://tickets.example.test/e',
      translations: { he: { title, summary: 'תקציר', description: 'פרטים.' } },
    });
    const res = await read(null, `/api/v1/events/${encodeURIComponent(event.slug)}?locale=en`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title,
      locale: 'he',
      fallback: true,
      cancelled: false,
      startAt: future(10),
      endAt: future(10, 15),
      registrationMode: 'EXTERNAL',
      registrationUrl: 'https://tickets.example.test/e',
      imageFileId: file.body.id,
    });
    // The image follows the event: readable once the event is public.
    await read(null, `/api/v1/files/${file.body.id}/url`).expect(200);
  });

  it('lists upcoming events soonest first, and past events separately', async () => {
    const category = await h
      .http()
      .post('/api/v1/admin/events/categories')
      .set(as(admin))
      .send({ key: `list_${run}`, nameHe: 'רשימה', nameEn: 'List' })
      .expect(201);
    const categoryId = category.body.id as string;
    const later = await published({ categoryId, startAt: future(30), endAt: future(30, 15) });
    const sooner = await published({ categoryId, startAt: future(20), endAt: future(20, 15) });
    const draft = await create({ categoryId });
    const past = await published({
      categoryId,
      startAt: '2020-03-01T07:00:00.000Z',
      endAt: '2020-03-01T15:00:00.000Z',
    });

    const slugs = async (when: string) =>
      (
        (await read(null, `/api/v1/events?when=${when}&category=list_${run}`).expect(200)).body
          .items as { slug: string }[]
      ).map((i) => i.slug);
    expect(await slugs('upcoming')).toEqual([sooner.slug, later.slug]);
    expect(await slugs('past')).toEqual([past.slug]);
    expect(await slugs('upcoming')).not.toContain(draft.slug);

    const categories = await read(null, '/api/v1/events/categories').expect(200);
    expect(categories.body.items.map((c: { key: string }) => c.key)).toContain(`list_${run}`);
  });

  it('cancels with a reason: the event stays visible, marked, and can’t be edited', async () => {
    const event = await published();
    const cancel = (body: object) =>
      h.http().post(`/api/v1/admin/events/${event.id}/cancel`).set(as(admin)).send(body);
    await cancel({ reason: '' }).expect(400);
    const done = await cancel({ reason: 'The venue is closed' }).expect(200);
    expect(done.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'The venue is closed' });

    const res = await read(null, `/api/v1/events/${encodeURIComponent(event.slug)}`).expect(200);
    expect(res.body).toMatchObject({ cancelled: true, cancelReason: 'The venue is closed' });

    const edit = await h
      .http()
      .put(`/api/v1/admin/events/${event.id}`)
      .set(as(admin))
      .set('If-Match', `"${done.body.version}"`)
      .send(input())
      .expect(422);
    expect(edit.body.error.details[0].code).toBe('eventCancelled');
    const again = await cancel({ reason: 'x' }).expect(422);
    expect(again.body.error.details[0].code).toBe('eventNotPublished');
  });

  it('deletes only drafts', async () => {
    const draft = await create();
    await h.http().delete(`/api/v1/admin/events/${draft.id}`).set(as(admin)).expect(204);
    await h.http().get(`/api/v1/admin/events/${draft.id}`).set(as(admin)).expect(404);

    const live = await published();
    const res = await h.http().delete(`/api/v1/admin/events/${live.id}`).set(as(admin)).expect(422);
    expect(res.body.error.details[0].code).toBe('eventNotDeletable');
  });

  it('keeps a published event publishable when it is edited', async () => {
    const event = await published();
    const current = await h.http().get(`/api/v1/admin/events/${event.id}`).set(as(admin));
    const res = await h
      .http()
      .put(`/api/v1/admin/events/${event.id}`)
      .set(as(admin))
      .set('If-Match', `"${current.body.version}"`)
      .send(input({ startAt: null, endAt: null }))
      .expect(422);
    expect(res.body.error.details[0].code).toBe('eventDatesRequired');
  });

  describe('access tiers', () => {
    const slugs: Record<'public' | 'members' | 'full', string> = {
      public: '',
      members: '',
      full: '',
    };
    const readers: Record<string, string | null> = {};
    const key = `tier_${run}`;

    async function member(typeKey: string, then?: 'suspend'): Promise<string> {
      const iuaAdmin = await signInAdmin(h, 'tier-admin');
      const email = await createVerifiedUser(h, 'reader');
      const created = await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(as(iuaAdmin))
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
          .post(`/api/v1/admin/memberships/${created.body.membership.id}/${then}`)
          .set(as(iuaAdmin))
          .send({ reason: 'Test' })
          .expect(200);
      }
      return (await signIn(h, email)).accessToken;
    }

    beforeAll(async () => {
      const category = await h
        .http()
        .post('/api/v1/admin/events/categories')
        .set(as(admin))
        .send({ key, nameHe: 'רמות', nameEn: 'Tiers' })
        .expect(201);
      const categoryId = category.body.id as string;
      slugs.public = (await published({ categoryId })).slug;
      slugs.members = (await published({ categoryId, accessTier: 'MEMBERS' })).slug;
      slugs.full = (
        await published({ categoryId, accessTier: 'TYPES', typeIds: [types.FULL_MEMBER] })
      ).slug;
      readers.anonymous = null;
      readers.noMembership = (await signIn(h, await createVerifiedUser(h, 'reader'))).accessToken;
      readers.full = await member('FULL_MEMBER');
      readers.student = await member('STUDENT');
      readers.suspended = await member('FULL_MEMBER', 'suspend');
    });

    const expected: Record<string, ('public' | 'members' | 'full')[]> = {
      anonymous: ['public'],
      noMembership: ['public'],
      full: ['public', 'members', 'full'],
      student: ['public', 'members'],
      suspended: ['public'],
    };

    for (const [who, visible] of Object.entries(expected)) {
      it(`${who}: sees ${visible.join(', ')} in the list and by link, and nothing else`, async () => {
        const list = await read(readers[who]!, `/api/v1/events?category=${key}`).expect(200);
        expect((list.body.items as { slug: string }[]).map((i) => i.slug).sort()).toEqual(
          visible.map((name) => slugs[name]).sort(),
        );
        for (const name of ['public', 'members', 'full'] as const) {
          const res = await read(
            readers[who]!,
            `/api/v1/events/${encodeURIComponent(slugs[name])}`,
          );
          expect(res.status).toBe(visible.includes(name) ? 200 : 404);
        }
      });
    }
  });
});
