import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import sharp from 'sharp';
import { type DeclaredRoute, listRoutes } from '../src/common/route-audit';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createOrganisation,
  createVerifiedUser,
  grantRole,
  signIn,
  signInOrganisationAdmin,
  signInPlatformAdmin,
  signInWithMfa,
  startHarness,
  uniqueEmail,
} from './auth-harness';

/**
 * M16 exit criterion: "A test with two organisations proves that neither's staff, members or
 * content leak into the other's, on every route that has a scope."
 *
 * Two organisations: the society (the default one) and a college made for this suite. The
 * college owns one of everything an organisation can own. Then the society's office, which
 * holds every organisation-level permission in the society and nothing in the college, tries
 * every route whose permission can be held inside an organisation. The routes are read from
 * the running application, so a route added later is swept without anyone remembering to add
 * it, and a new kind of thing fails the sweep until it is taught where to find one.
 */
describe('an organisation sees only its own (integration)', () => {
  let h: Harness;
  let routes: DeclaredRoute[];
  type Staff = { accessToken: string; userId: string; email: string };
  let societyOffice: Staff;
  let collegeOffice: Staff;
  let collegeEditor: Staff;
  let platformAdmin: Staff;
  let superAdmin: Staff;
  let college: { id: string; slug: string; typeId: string };
  /** A college member, with a name. */
  let fellow: { email: string; token: string; userId: string };
  /** The ids of what the college owns. */
  const theirs = {
    news: '',
    event: '',
    session: '',
    speaker: '',
    room: '',
    broadcast: '',
    position: '',
    membership: '',
    application: '',
    batch: '',
    report: '',
    image: '',
  };
  const NOBODY = '0190a000-0000-7000-8000-00000000c0de';
  const run = Date.now().toString(36);
  const as = (who: { accessToken: string }) => bearer(who.accessToken);
  const day = (n: number, hour = 7) => new Date(Date.UTC(2032, 3, n, hour)).toISOString();
  const HEADER =
    'email,first_name,last_name,membership_type,identifier,end_date,payment_status,locale';
  let batchCsv = '';

  const newsBody = (extra: object = {}) => ({
    translations: { he: { title: `ידיעת המכללה ${run}`, body: 'גוף', summary: 'תקציר' } },
    ...extra,
  });
  const eventBody = (extra: object = {}) => ({
    startAt: day(10),
    endAt: day(10, 16),
    locationName: 'Example Hall',
    registrationMode: 'INTERNAL',
    translations: { he: { title: `אירוע המכללה ${run}`, description: 'פרטים.' } },
    ...extra,
  });
  const sessionBody = () => ({
    startAt: day(10, 8),
    endAt: day(10, 9),
    translations: { he: { title: `מושב ${run}` } },
  });
  const speakerBody = (extra: object = {}) => ({
    translations: { he: { name: `מרצה בדוי ${run}` } },
    ...extra,
  });
  const roomBody = (extra: object = {}) => ({ nameHe: `חדר המכללה ${run}`, ...extra });
  const broadcastBody = (extra: object = {}) => ({
    audience: { all: true },
    translations: { he: { title: `הודעת המכללה ${run}`, body: 'טקסט.' } },
    ...extra,
  });

  const positionBody = () => ({
    kind: 'JOB',
    institutionName: `College clinic ${run}`,
    city: 'Haifa',
    applyEmail: `jobs-${run}@example.test`,
    closesOn: '2032-04-30',
    translations: { he: { title: `משרה במכללה ${run}`, body: 'טקסט.' } },
  });

  async function named(label: string): Promise<{ email: string; token: string; userId: string }> {
    const email = await createVerifiedUser(h, label);
    const token = (await signIn(h, email)).accessToken;
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(token))
      .send({ firstName: 'Dana', lastName: `Fictional ${run}` })
      .expect(200);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { email, token, userId: rows[0]!.id };
  }

  beforeAll(async () => {
    h = await startHarness();
    routes = listRoutes(
      new DiscoveryService(h.app.get(ModulesContainer)),
      new MetadataScanner(),
      new Reflector(),
    ).filter((route) => route.scoped);

    college = await createOrganisation(h, 'college');
    societyOffice = await signInOrganisationAdmin(h, DEFAULT_ORGANISATION, 'society-office');
    collegeOffice = await signInOrganisationAdmin(h, college.id, 'college-office');
    collegeEditor = await signInWithMfa(h, 'college-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', college.id),
    );
    platformAdmin = await signInPlatformAdmin(h);
    superAdmin = await signInWithMfa(h, 'two-orgs-super', (email) =>
      grantRole(h, email, 'SUPER_ADMIN'),
    );

    // --- One of everything, owned by the college ----------------------------------------------
    fellow = await named('fellow');
    theirs.membership = (
      await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(as(collegeOffice))
        .send({ email: fellow.email, typeId: college.typeId })
        .expect(201)
    ).body.membership.id;

    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 80, b: 160 } },
    })
      .png()
      .toBuffer();
    theirs.image = (
      await h
        .http()
        .post('/api/v1/files')
        .set(as(collegeOffice))
        .attach('file', png, 'college.png')
        .expect(201)
    ).body.id;
    const news = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(collegeOffice))
      .send(newsBody({ featuredImageFileId: theirs.image }))
      .expect(201);
    theirs.news = news.body.id;
    // Left unsaid, a new item is its writer's only organisation's.
    expect(news.body.organisation).toMatchObject({ id: college.id, slug: college.slug });

    theirs.event = (
      await h
        .http()
        .post('/api/v1/admin/events')
        .set(as(collegeOffice))
        .send(eventBody())
        .expect(201)
    ).body.id;
    theirs.session = (
      await h
        .http()
        .post(`/api/v1/admin/events/${theirs.event}/sessions`)
        .set(as(collegeOffice))
        .send(sessionBody())
        .expect(201)
    ).body.id;
    theirs.speaker = (
      await h
        .http()
        .post('/api/v1/admin/speakers')
        .set(as(collegeOffice))
        .send(speakerBody())
        .expect(201)
    ).body.id;
    theirs.room = (
      await h
        .http()
        .post('/api/v1/admin/chat/rooms')
        .set(as(collegeOffice))
        .send(roomBody())
        .expect(201)
    ).body.id;
    theirs.broadcast = (
      await h
        .http()
        .post('/api/v1/admin/broadcasts')
        .set(as(collegeOffice))
        .send(broadcastBody())
        .expect(201)
    ).body.id;
    theirs.position = (
      await h
        .http()
        .post('/api/v1/admin/positions')
        .set(as(collegeOffice))
        .send(positionBody())
        .expect(201)
    ).body.id;

    const applicant = await named('college-applicant');
    theirs.application = (
      await h
        .http()
        .post('/api/v1/verification-requests')
        .set(bearer(applicant.token))
        .send({ typeId: college.typeId })
        .expect(201)
    ).body.id;

    batchCsv = `${HEADER}\n${uniqueEmail('college-import')},Noa,Fictional,MEMBER,,,,`;
    theirs.batch = (
      await h
        .http()
        .post('/api/v1/admin/memberships/import')
        .set(as(collegeOffice))
        .send({ fileName: 'college.csv', csv: batchCsv })
        .expect(200)
    ).body.batchId;

    const categories = await h
      .http()
      .get('/api/v1/chat/report-categories')
      .set(bearer(fellow.token))
      .expect(200);
    theirs.report = (
      await h
        .http()
        .post('/api/v1/chat/reports')
        .set(bearer(fellow.token))
        .send({ roomId: theirs.room, categoryId: categories.body.items[0].id })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await h.close();
  });

  // --- The sweep --------------------------------------------------------------------------------

  /**
   * The route's address with the ids of the college's things in it; null for a route with no
   * thing in its address (a list, or "create").
   */
  function theirPath(route: DeclaredRoute): string | null {
    if (!route.path.includes(':')) return null;
    const fill = (ids: Record<string, string>) =>
      route.path.replace(/:([A-Za-z]+)/g, (_match, name: string) => ids[name] ?? NOBODY);
    const kinds: [string, Record<string, string>][] = [
      ['admin/news/', { id: theirs.news }],
      ['admin/events/:eventId', { eventId: theirs.event, sessionId: theirs.session }],
      ['admin/events/', { id: theirs.event }],
      ['admin/speakers/', { id: theirs.speaker }],
      ['admin/chat/rooms/', { id: theirs.room, userId: fellow.userId }],
      ['admin/chat/reports/', { id: theirs.report }],
      ['admin/broadcasts/', { id: theirs.broadcast }],
      ['admin/positions/', { id: theirs.position }],
      ['admin/memberships/import/', { batchId: theirs.batch }],
      ['admin/memberships/', { id: theirs.membership }],
    ];
    const kind = kinds.find(([prefix]) => route.path.startsWith(prefix));
    if (!kind)
      throw new Error(`The sweep does not know what ${route.method} ${route.path} is about`);
    return `/api/v1/${fill(kind[1])}`;
  }

  /** A request each route accepts, so that what answers is the owner check and not the form. */
  function bodyFor(route: DeclaredRoute): object | undefined {
    const bodies: Record<string, object> = {
      'PUT admin/news/:id': newsBody(),
      'POST admin/news/:id/transitions': { action: 'SUBMIT' },
      'PUT admin/events/:id': eventBody(),
      'POST admin/events/:id/cancel': { reason: 'Test' },
      'POST admin/events/:eventId/sessions': sessionBody(),
      'PUT admin/events/:eventId/sessions/:sessionId': sessionBody(),
      'POST admin/events/:eventId/attendance': { email: fellow.email },
      'POST admin/events/:eventId/attendance/:attendanceId/void': { reason: 'Test' },
      'PUT admin/speakers/:id': speakerBody(),
      'PUT admin/chat/rooms/:id': roomBody({ nameHe: `שם אחר ${run}` }),
      'POST admin/chat/rooms/:id/moderators': { userId: fellow.userId },
      'POST admin/chat/reports/:id/resolve': { decision: 'dismiss', reason: 'Not theirs' },
      'PUT admin/positions/:id': positionBody(),
      'POST admin/positions/:id/transitions': { action: 'SUBMIT' },
      'PUT admin/broadcasts/:id': broadcastBody(),
      'POST admin/broadcasts/:id/reject': { reason: 'Test' },
      'POST admin/memberships/import/:batchId/apply': { csv: batchCsv },
      'POST admin/memberships/:id/renew': {},
      'POST admin/memberships/:id/suspend': { reason: 'Test' },
      'POST admin/memberships/:id/reinstate': {},
      'POST admin/memberships/:id/expire': {},
      'PATCH admin/memberships/:id/payment-status': { paymentStatus: 'PAID' },
    };
    return bodies[`${route.method} ${route.path}`];
  }

  const call = (route: DeclaredRoute, path: string, who: { accessToken: string }) => {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    let req = h.http()[method](path).set(as(who)).set('If-Match', '"1"');
    const body = bodyFor(route);
    if (body) req = req.send(body);
    return req;
  };

  /** What the college's things look like, to tell afterwards that nothing touched them. */
  async function snapshot(): Promise<string> {
    const one = async (path: string) =>
      (await h.http().get(path).set(as(collegeOffice)).expect(200)).body as Record<string, unknown>;
    const [news, event, room, broadcast, membership, sessions, speakers, position] =
      await Promise.all([
        one(`/api/v1/admin/news/${theirs.news}`),
        one(`/api/v1/admin/events/${theirs.event}`),
        one(`/api/v1/admin/chat/rooms/${theirs.room}`),
        one(`/api/v1/admin/broadcasts/${theirs.broadcast}`),
        one(`/api/v1/admin/memberships/${theirs.membership}`),
        one(`/api/v1/admin/events/${theirs.event}/sessions`),
        one('/api/v1/admin/speakers'),
        one(`/api/v1/admin/positions/${theirs.position}`),
      ]);
    const { rows } = await h.db.query(
      `SELECT (SELECT status::text FROM import_batches WHERE id = $1) AS batch,
              (SELECT state::text FROM verification_requests WHERE id = $2) AS application,
              (SELECT status::text FROM chat_reports WHERE id = $3) AS report`,
      [theirs.batch, theirs.application, theirs.report],
    );
    return JSON.stringify({
      news: [news.status, news.version, news.translations],
      event: [event.status, event.version, event.translations],
      room: [room.nameHe, room.archived, room.moderators],
      broadcast: [broadcast.status, broadcast.translations],
      position: [position.status, position.version, position.translations],
      membership: [
        (membership.membership as Record<string, unknown>).status,
        (membership.membership as Record<string, unknown>).paymentStatus,
        (membership.history as unknown[]).length,
      ],
      sessions,
      speakers,
      rows,
    });
  }

  it('finds the routes whose permission can be held inside an organisation', () => {
    const paths = routes.map((route) => `${route.method} ${route.path}`);
    expect(paths.length).toBeGreaterThan(60);
    for (const expected of [
      'GET admin/news',
      'PUT admin/news/:id',
      'POST admin/events/:id/publish',
      'POST admin/events/:eventId/sessions',
      'GET admin/events/:eventId/registrations',
      'GET admin/events/:eventId/attendance.csv',
      'PUT admin/speakers/:id',
      'POST admin/chat/rooms/:id/archive',
      'POST admin/chat/reports/:id/resolve',
      'POST admin/broadcasts/:id/approve',
      'POST admin/memberships/:id/suspend',
      'POST admin/memberships/import/:batchId/apply',
    ]) {
      expect(paths).toContain(expected);
    }
    // What is the platform's alone is not among them: its staff are asked for by name.
    for (const platformOnly of [
      'GET admin/users',
      'POST admin/education',
      'POST admin/guidelines',
      'POST admin/events/categories',
      'POST admin/chat/room-categories',
      'POST admin/chat/suspensions',
      'GET admin/audit-logs',
    ]) {
      expect(paths).not.toContain(platformOnly);
    }
  });

  it('the sweep’s addresses are real: each thing is there for its own organisation’s office', async () => {
    const wrong: string[] = [];
    for (const route of routes.filter((r) => r.method === 'GET')) {
      const path = theirPath(route);
      if (!path) continue;
      const res = await call(route, path, collegeOffice);
      // Found, and theirs. (The venue code of an event that is not published is refused as a
      // rule of events, which is still an answer about a thing that is there.)
      const ruleOfEvents = route.path.endsWith('attendance/code') && res.status === 422;
      if (res.status !== 200 && !ruleOfEvents) {
        wrong.push(`${route.method} ${route.path} → ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  for (const [who, staff, refusals] of [
    ['the other organisation’s office', () => societyOffice, [404]],
    // The platform's administrator holds no membership permission anywhere, so those routes
    // refuse them outright; the rest answer "not found".
    [
      'the platform’s administrator, who does not reach into organisations',
      () => platformAdmin,
      [404, 403],
    ],
  ] as const) {
    it(`every route about one thing is closed to ${who}`, async () => {
      const before = await snapshot();
      const wrong: string[] = [];
      for (const route of routes) {
        const path = theirPath(route);
        if (!path) continue;
        const res = await call(route, path, staff());
        const membership = route.path.startsWith('admin/memberships');
        const allowed: readonly number[] = membership ? refusals : [404];
        if (!allowed.includes(res.status)) {
          wrong.push(`${route.method} ${route.path} → ${res.status} ${JSON.stringify(res.body)}`);
        }
      }
      expect(wrong).toEqual([]);
      // And nothing of the college's changed.
      expect(await snapshot()).toBe(before);
    });
  }

  it('a thing of another organisation looks exactly like one that does not exist', async () => {
    const different: string[] = [];
    for (const route of routes) {
      const path = theirPath(route);
      if (!path) continue;
      const missing = `/api/v1/${route.path.replace(/:[A-Za-z]+/g, NOBODY)}`;
      const [theirsAnswer, missingAnswer] = [
        await call(route, path, societyOffice),
        await call(route, missing, societyOffice),
      ];
      const shape = (res: { status: number; body: { error?: Record<string, unknown> } }) => {
        const { correlationId: _correlationId, ...error } = res.body.error ?? {};
        return JSON.stringify([res.status, error]);
      };
      if (shape(theirsAnswer) !== shape(missingAnswer)) {
        different.push(`${route.method} ${route.path}`);
      }
    }
    expect(different).toEqual([]);
  });

  it('the lists show an office its own organisation’s things, and never another’s', async () => {
    const lists: [string, string][] = [
      ['/api/v1/admin/news?pageSize=100', theirs.news],
      ['/api/v1/admin/events?pageSize=100', theirs.event],
      ['/api/v1/admin/speakers?pageSize=100', theirs.speaker],
      ['/api/v1/admin/chat/rooms', theirs.room],
      ['/api/v1/admin/chat/reports', theirs.report],
      ['/api/v1/admin/broadcasts?pageSize=100', theirs.broadcast],
      ['/api/v1/admin/memberships?pageSize=100', theirs.membership],
    ];
    for (const [path, id] of lists) {
      const own = await h.http().get(path).set(as(collegeOffice)).expect(200);
      expect(JSON.stringify(own.body)).toContain(id);
      // Everything on the college's list is the college's.
      for (const item of own.body.items as { organisation?: { id: string } | null }[]) {
        if (item.organisation !== undefined) expect(item.organisation?.id).toBe(college.id);
      }
      for (const other of [societyOffice, platformAdmin]) {
        const res = await h.http().get(path).set(as(other));
        // The platform's administrator has no members at all to list.
        if (res.status === 403) continue;
        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        for (const theirId of Object.values(theirs)) expect(text).not.toContain(theirId);
        expect(text).not.toContain(college.id);
      }
    }
    // Asking for another organisation's list by name is asking for something that is not there.
    for (const path of [
      '/api/v1/admin/news',
      '/api/v1/admin/events',
      '/api/v1/admin/chat/rooms',
      '/api/v1/admin/broadcasts',
      '/api/v1/admin/memberships',
    ]) {
      await h.http().get(`${path}?organisation=${college.id}`).set(as(societyOffice)).expect(404);
      await h.http().get(`${path}?organisation=${college.id}`).set(as(collegeOffice)).expect(200);
    }
  });

  it('nobody creates a thing for an organisation they are not staff of', async () => {
    const creations: [string, object][] = [
      ['/api/v1/admin/news', newsBody({ organisationId: college.id })],
      ['/api/v1/admin/events', eventBody({ organisationId: college.id })],
      ['/api/v1/admin/speakers', speakerBody({ organisationId: college.id })],
      ['/api/v1/admin/chat/rooms', roomBody({ organisationId: college.id, nameHe: `אחר ${run}` })],
      ['/api/v1/admin/broadcasts', broadcastBody({ organisationId: college.id })],
    ];
    for (const [path, body] of creations) {
      for (const who of [societyOffice, platformAdmin]) {
        const res = await h.http().post(path).set(as(who)).send(body).expect(400);
        expect(res.body.error.details).toEqual([
          { field: 'organisationId', code: 'unknownOrganisation' },
        ]);
      }
      // An organisation's office does not write as the platform either.
      const asPlatform = await h
        .http()
        .post(path)
        .set(as(societyOffice))
        .send({ ...body, organisationId: null })
        .expect(400);
      expect(asPlatform.body.error.details[0].code).toBe('unknownOrganisation');
    }
    // A membership type of another organisation is, for the office, no type at all.
    const email = await createVerifiedUser(h, 'not-theirs');
    const refused = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as(societyOffice))
      .send({ email, typeId: college.typeId })
      .expect(400);
    expect(refused.body.error.details).toEqual([
      { field: 'typeId', code: 'unknownMembershipType' },
    ]);
    // A file of members for another organisation.
    const batch = await h
      .http()
      .post('/api/v1/admin/memberships/import')
      .set(as(societyOffice))
      .send({ csv: batchCsv, organisation: college.id })
      .expect(400);
    expect(batch.body.error.details[0].code).toBe('unknownOrganisation');
  });

  it('whose a thing is can’t be changed afterwards, and its settings stay its owner’s', async () => {
    const mine = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(collegeOffice))
      .send(newsBody())
      .expect(201);
    const moved = await h
      .http()
      .put(`/api/v1/admin/news/${mine.body.id}`)
      .set(as(collegeOffice))
      .set('If-Match', `"${mine.body.version}"`)
      .send(newsBody({ organisationId: DEFAULT_ORGANISATION }))
      .expect(400);
    expect(moved.body.error.details).toEqual([
      { field: 'organisationId', code: 'ownerCannotChange' },
    ]);
    // An organisation's item names its own membership types only.
    const types = await h
      .http()
      .get(`/api/v1/membership-types?organisation=${DEFAULT_ORGANISATION}`)
      .expect(200);
    const foreign = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(collegeOffice))
      .send(newsBody({ accessTier: 'TYPES', typeIds: [types.body.items[0].id] }))
      .expect(400);
    expect(foreign.body.error.details).toEqual([
      { field: 'typeIds', code: 'unknownMembershipType' },
    ]);
    await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(collegeOffice))
      .send(newsBody({ accessTier: 'TYPES', typeIds: [college.typeId] }))
      .expect(201);
    // "Members" needs an organisation: the platform has none.
    const platformNews = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(platformAdmin))
      .send(newsBody({ accessTier: 'MEMBERS' }))
      .expect(400);
    expect(platformNews.body.error.details).toEqual([
      { field: 'accessTier', code: 'tierNeedsOrganisation' },
    ]);
    const ofPlatform = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(platformAdmin))
      .send(newsBody({ accessTier: 'VERIFIED' }))
      .expect(201);
    expect(ofPlatform.body.organisation).toBeNull();
    // And the platform's own item does not exist for an organisation's office.
    await h
      .http()
      .get(`/api/v1/admin/news/${ofPlatform.body.id}`)
      .set(as(societyOffice))
      .expect(404);
  });

  it('a session names speakers from its own organisation’s list', async () => {
    const societySpeaker = await h
      .http()
      .post('/api/v1/admin/speakers')
      .set(as(societyOffice))
      .send(speakerBody())
      .expect(201);
    const refused = await h
      .http()
      .put(`/api/v1/admin/events/${theirs.event}/sessions/${theirs.session}`)
      .set(as(collegeOffice))
      .send({ ...sessionBody(), speakerIds: [societySpeaker.body.id] })
      .expect(400);
    expect(refused.body.error.details).toEqual([{ field: 'speakerIds', code: 'unknownSpeaker' }]);
    await h
      .http()
      .put(`/api/v1/admin/events/${theirs.event}/sessions/${theirs.session}`)
      .set(as(collegeOffice))
      .send({ ...sessionBody(), speakerIds: [theirs.speaker] })
      .expect(200);
    // The list for an event: those its owner keeps.
    const forEvent = await h
      .http()
      .get(`/api/v1/admin/speakers?eventId=${theirs.event}`)
      .set(as(collegeOffice))
      .expect(200);
    expect(forEvent.body.items.map((item: { id: string }) => item.id)).toEqual([theirs.speaker]);
    await h
      .http()
      .get(`/api/v1/admin/speakers?eventId=${theirs.event}`)
      .set(as(societyOffice))
      .expect(404);
  });

  it('a draft’s picture is for the staff of its owner, and for nobody else', async () => {
    const url = (who: { accessToken: string }) =>
      h.http().get(`/api/v1/files/${theirs.image}/url`).set(as(who));
    // The person who uploaded it, and a colleague who works on the same organisation's news.
    await url(collegeOffice).expect(200);
    await url(collegeEditor).expect(200);
    await url(societyOffice).expect(404);
    await h.http().get(`/api/v1/files/${theirs.image}/url`).expect(404);
    await h.http().get(`/api/v1/files/${theirs.image}/url`).set(bearer(fellow.token)).expect(404);
  });

  // --- Applications and members -----------------------------------------------------------------

  it('an application goes to the office of the organisation applied to', async () => {
    const queue = (who: { accessToken: string }, query = '') =>
      h.http().get(`/api/v1/verification-requests?stage=admin${query}`).set(as(who));
    const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((i) => i.id);

    expect(ids(await queue(collegeOffice).expect(200))).toContain(theirs.application);
    const societyQueue = await queue(societyOffice).expect(200);
    expect(ids(societyQueue)).not.toContain(theirs.application);
    expect(JSON.stringify(societyQueue.body)).not.toContain(college.id);
    await queue(societyOffice, `&organisation=${college.id}`).expect(404);
    // The platform's administrator has no office anywhere.
    await queue(platformAdmin).expect(403);

    const decide = (who: { accessToken: string }) =>
      h
        .http()
        .post(`/api/v1/verification-requests/${theirs.application}/decisions`)
        .set(as(who))
        .send({ decision: 'APPROVE' });
    await decide(societyOffice).expect(404);
    await decide(platformAdmin).expect(403);
    const approved = await decide(collegeOffice).expect(200);
    expect(approved.body).toMatchObject({
      state: 'APPROVED',
      organisation: { id: college.id },
    });
    // The applicant is now a member of the college, and a physician the platform knows.
    const { rows } = await h.db.query<{ organisation_id: string; verified: boolean }>(
      `SELECT m.organisation_id, u.verified_at IS NOT NULL AS verified
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE u.email = $1`,
      [approved.body.applicant.email],
    );
    expect(rows).toEqual([{ organisation_id: college.id, verified: true }]);
  });

  it('a person applies to two organisations at once, each on its own', async () => {
    const applicant = await named('two-applications');
    const apply = (typeId: string) =>
      h.http().post('/api/v1/verification-requests').set(bearer(applicant.token)).send({ typeId });
    const types = await h
      .http()
      .get(`/api/v1/membership-types?organisation=${DEFAULT_ORGANISATION}`)
      .expect(200);
    const student = (types.body.items as { key: string; id: string }[]).find(
      (type) => type.key === 'STUDENT',
    )!;
    const toCollege = await apply(college.typeId).expect(201);
    const toSociety = await apply(student.id).expect(201);
    expect(toCollege.body.organisation.id).toBe(college.id);
    expect(toSociety.body.organisation.id).toBe(DEFAULT_ORGANISATION);
    // One open application in each.
    const again = await apply(college.typeId).expect(409);
    expect(again.body.error.details[0].code).toBe('applicationOpen');
    const mine = await h
      .http()
      .get('/api/v1/verification-requests/mine')
      .set(bearer(applicant.token))
      .expect(200);
    expect(mine.body.items).toHaveLength(2);
  });

  it('a file of members brings them into the office’s own organisation only', async () => {
    const applied = await h
      .http()
      .post(`/api/v1/admin/memberships/import/${theirs.batch}/apply`)
      .set(as(collegeOffice))
      .send({ csv: batchCsv })
      .expect(200);
    expect(applied.body.totals.CREATE_ACCOUNT).toBe(1);
    const email = batchCsv.split('\n')[1]!.split(',')[0]!;
    const { rows } = await h.db.query<{ organisation_id: string; verified: boolean }>(
      `SELECT m.organisation_id, u.verified_at IS NOT NULL AS verified
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
      [email],
    );
    expect(rows).toEqual([{ organisation_id: college.id, verified: true }]);
    // The same type name means another organisation's type in another organisation's file.
    const wrongPlace = await h
      .http()
      .post('/api/v1/admin/memberships/import')
      .set(as(societyOffice))
      .send({ csv: batchCsv })
      .expect(200);
    expect(wrongPlace.body.rows[0]).toMatchObject({ action: 'SKIP' });
  });

  it('platform staff look into an organisation only with the named permission, and it is written down', async () => {
    const detail = (who: { accessToken: string }) =>
      h.http().get(`/api/v1/admin/memberships/${theirs.membership}`).set(as(who));
    const reads = async () =>
      (
        await h.db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM audit_logs
           WHERE action = 'membership.support.read' AND entity_id = $1`,
          [theirs.membership],
        )
      ).rows[0]!.n;

    await detail(platformAdmin).expect(403);
    const before = await reads();
    // The organisation's own office reads its members' files as its ordinary work.
    await detail(collegeOffice).expect(200);
    expect(await reads()).toBe(before);
    // A super administrator may, for support; each look is recorded with who and when.
    const seen = await detail(superAdmin).expect(200);
    expect(seen.body.membership.organisation.id).toBe(college.id);
    expect(await reads()).toBe(before + 1);

    // The account page: memberships are shown only to whoever may look inside, and recorded.
    const account = (who: { accessToken: string }) =>
      h.http().get(`/api/v1/admin/users/${fellow.userId}`).set(as(who));
    expect((await account(platformAdmin).expect(200)).body.memberships).toBeNull();
    const full = await account(superAdmin).expect(200);
    expect(full.body.memberships).toEqual([
      expect.objectContaining({
        id: theirs.membership,
        organisation: expect.objectContaining({ id: college.id }),
      }),
    ]);
    const { rows } = await h.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs
       WHERE action = 'membership.support.read' AND entity_type = 'user' AND entity_id = $1`,
      [fellow.userId],
    );
    expect(rows[0]!.n).toBe(1);
  });

  // --- Messages to members ----------------------------------------------------------------------

  it('an organisation’s message reaches its own members; the platform’s, every verified person', async () => {
    const audience = async (who: { accessToken: string }, id: string) =>
      (await h.http().get(`/api/v1/admin/broadcasts/${id}/audience`).set(as(who)).expect(200)).body
        .count as number;
    const count = async (sql: string, params: unknown[] = []) =>
      (await h.db.query<{ n: number }>(sql, params)).rows[0]!.n;
    const active = `u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL`;

    expect(await audience(collegeOffice, theirs.broadcast)).toBe(
      await count(
        `SELECT count(*)::int AS n FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE ${active} AND m.organisation_id = $1 AND m.status = 'ACTIVE'
           AND m.end_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date`,
        [college.id],
      ),
    );
    const platformMessage = await h
      .http()
      .post('/api/v1/admin/broadcasts')
      .set(as(platformAdmin))
      .send(broadcastBody())
      .expect(201);
    expect(platformMessage.body.organisation).toBeNull();
    expect(await audience(platformAdmin, platformMessage.body.id)).toBe(
      await count(
        `SELECT count(*)::int AS n FROM users u WHERE ${active} AND u.verified_at IS NOT NULL
           AND (u.verified_until IS NULL OR u.verified_until > now())`,
      ),
    );
    // An organisation writes to its own membership types.
    const types = await h
      .http()
      .get(`/api/v1/membership-types?organisation=${DEFAULT_ORGANISATION}`)
      .expect(200);
    const foreign = await h
      .http()
      .post('/api/v1/admin/broadcasts')
      .set(as(collegeOffice))
      .send(broadcastBody({ audience: { all: false, typeIds: [types.body.items[0].id] } }))
      .expect(400);
    expect(foreign.body.error.details[0].code).toBe('broadcastUnknownType');

    // Sent: only the college's members can read it.
    await h
      .http()
      .post(`/api/v1/admin/broadcasts/${theirs.broadcast}/submit`)
      .set(as(collegeOffice))
      .expect(200);
    const second = await signInOrganisationAdmin(h, college.id, 'college-second');
    // The other organisation's office can't decide on it; it does not exist for them.
    await h
      .http()
      .post(`/api/v1/admin/broadcasts/${theirs.broadcast}/approve`)
      .set(as(societyOffice))
      .expect(404);
    await h
      .http()
      .post(`/api/v1/admin/broadcasts/${theirs.broadcast}/approve`)
      .set(as(second))
      .expect(200);
    await h
      .http()
      .get(`/api/v1/broadcasts/${theirs.broadcast}`)
      .set(bearer(fellow.token))
      .expect(200);
    const outsider = await named('society-reader');
    await h
      .http()
      .get(`/api/v1/broadcasts/${theirs.broadcast}`)
      .set(bearer(outsider.token))
      .expect(404);
  });

  // --- Rooms and their moderation ---------------------------------------------------------------

  it('chat staff moderate the rooms of their own organisation', async () => {
    const room = (who: { accessToken: string }, tail = '') =>
      h.http().get(`/api/v1/chat/rooms/${theirs.room}${tail}`).set(as(who));
    // The college's office reads its room without joining; the society's does not see it.
    await room(collegeOffice).expect(200);
    await room(collegeOffice, '/messages').expect(200);
    // Chat staff of another organisation: the room is simply not there.
    await room(societyOffice).expect(404);
    await h
      .http()
      .post(`/api/v1/chat/rooms/${theirs.room}/lock`)
      .set(as(societyOffice))
      .send({})
      .expect(404);
    await h
      .http()
      .post(`/api/v1/chat/rooms/${theirs.room}/lock`)
      .set(as(platformAdmin))
      .send({})
      .expect(404);
    // The report about the college's room is the college's to review.
    await h
      .http()
      .post(`/api/v1/admin/chat/reports/${theirs.report}/resolve`)
      .set(as(collegeOffice))
      .send({ decision: 'dismiss', reason: 'Looked at it' })
      .expect(200);
    // Suspending a person from all of chat is the platform's decision, not an organisation's.
    await h
      .http()
      .post('/api/v1/admin/chat/suspensions')
      .set(as(collegeOffice))
      .send({ userId: fellow.userId, reason: 'Test', days: 1 })
      .expect(403);
    await h.http().get('/api/v1/admin/chat/suspensions').set(as(collegeOffice)).expect(403);
  });

  // --- Roles ------------------------------------------------------------------------------------

  it('a role is given on the platform or in an organisation, where it can be held', async () => {
    const person = await named('new-staff');
    const REASON = { reason: 'Joined the office' };
    const act = (action: 'roles' | 'roles/remove', body: object) =>
      h
        .http()
        .post(`/api/v1/admin/users/${person.userId}/${action}`)
        .set(as(superAdmin))
        .send({ ...body, ...REASON });
    const wrong = async (body: object) =>
      (await act('roles', body).expect(400)).body.error.details as unknown[];

    // An organisation's administrator is of an organisation; the platform's is not.
    expect(await wrong({ role: 'ORG_ADMIN' })).toEqual([{ field: 'role', code: 'roleWrongPlace' }]);
    expect(await wrong({ role: 'PLATFORM_ADMIN', organisationId: college.id })).toEqual([
      { field: 'role', code: 'roleWrongPlace' },
    ]);
    expect(await wrong({ role: 'SUPER_ADMIN', organisationId: college.id })).toEqual([
      { field: 'role', code: 'roleWrongPlace' },
    ]);
    expect(await wrong({ role: 'ORG_ADMIN', organisationId: NOBODY })).toEqual([
      { field: 'organisationId', code: 'unknownOrganisation' },
    ]);
    // Only whoever may give roles: not an organisation's own office, nor the platform's admin.
    await h
      .http()
      .post(`/api/v1/admin/users/${person.userId}/roles`)
      .set(as(collegeOffice))
      .send({ role: 'ORG_ADMIN', organisationId: college.id, ...REASON })
      .expect(403);
    await h
      .http()
      .post(`/api/v1/admin/users/${person.userId}/roles`)
      .set(as(platformAdmin))
      .send({ role: 'ORG_ADMIN', organisationId: college.id, ...REASON })
      .expect(403);

    const given = await act('roles', { role: 'ORG_ADMIN', organisationId: college.id }).expect(200);
    expect(given.body.roleGrants).toEqual([
      expect.objectContaining({
        role: 'ORG_ADMIN',
        organisation: expect.objectContaining({ id: college.id }),
      }),
    ]);
    // Given twice, held once.
    await act('roles', { role: 'ORG_ADMIN', organisationId: college.id }).expect(200);
    // An editor may be one in both places.
    await act('roles', { role: 'CONTENT_EDITOR' }).expect(200);
    const both = await act('roles', { role: 'CONTENT_EDITOR', organisationId: college.id }).expect(
      200,
    );
    expect(both.body.roleGrants).toHaveLength(3);

    // Removing it in one place leaves the other.
    const removed = await act('roles/remove', { role: 'CONTENT_EDITOR' }).expect(200);
    expect(
      removed.body.roleGrants.map(
        (grant: { role: string; organisation: { id: string } | null }) => [
          grant.role,
          grant.organisation?.id ?? null,
        ],
      ),
    ).toEqual([
      ['ORG_ADMIN', college.id],
      ['CONTENT_EDITOR', college.id],
    ]);
  });

  it('tells a person where they are staff, and what they may do there', async () => {
    const me = async (who: { accessToken: string }) =>
      (await h.http().get('/api/v1/me').set(as(who)).expect(200)).body;
    const office = await me(collegeOffice);
    expect(office.roles).toEqual(['ORG_ADMIN']);
    expect(office.platformPermissions).toEqual([]);
    expect(office.organisations).toEqual([
      {
        organisation: expect.objectContaining({ id: college.id, slug: college.slug }),
        roles: ['ORG_ADMIN'],
        permissions: expect.arrayContaining(['membership.manage', 'news.publish', 'chat.moderate']),
      },
    ]);
    // What is about the platform itself is not held in an organisation, whatever the role says.
    expect(office.organisations[0].permissions).not.toContain('users.read');
    expect(office.permissions).toEqual(office.organisations[0].permissions);
    expect(office.verified).toBe(false);

    const platform = await me(platformAdmin);
    expect(platform.organisations).toEqual([]);
    expect(platform.platformPermissions).toEqual(platform.permissions);
    expect(platform.permissions).toContain('users.manage');
    expect(platform.permissions).not.toContain('membership.read');
    expect(platform.permissions).not.toContain('organisations.access');

    // The editor's library permission means something only on the platform.
    const editor = await me(collegeEditor);
    expect(editor.organisations[0].permissions.sort()).toEqual(['files.upload', 'news.create']);
    await h.http().get('/api/v1/admin/education').set(as(collegeEditor)).expect(403);
  });

  // --- The dashboard ----------------------------------------------------------------------------

  it('the dashboard counts only what is the person’s to act on', async () => {
    const dashboard = async (who: { accessToken: string }, query = '') =>
      (await h.http().get(`/api/v1/admin/dashboard${query}`).set(as(who)).expect(200)).body;
    const collegeMembers = (
      await h.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM memberships
         WHERE organisation_id = $1 AND status = 'ACTIVE'
           AND end_date >= (now() AT TIME ZONE 'Asia/Jerusalem')::date`,
        [college.id],
      )
    ).rows[0]!.n;

    const office = await dashboard(collegeOffice);
    expect(office.members.active).toBe(collegeMembers);
    expect(office.members.byType.map((type: { key: string }) => type.key)).toEqual(['MEMBER']);
    // Accounts and the library are the platform's: no tile for an organisation's office.
    expect(office.accounts).toBeNull();
    expect(office.review.education).toBeNull();

    const society = await dashboard(societyOffice);
    expect(society.members.byType.map((type: { key: string }) => type.key)).not.toContain('MEMBER');

    const platform = await dashboard(platformAdmin);
    expect(platform.members).toBeNull();
    expect(platform.applications).toBeNull();
    expect(platform.accounts).not.toBeNull();

    // One owner at a time.
    expect((await dashboard(superAdmin, `?owner=${college.id}`)).members.active).toBe(
      collegeMembers,
    );
    const platformOnly = await dashboard(superAdmin, '?owner=platform');
    expect(platformOnly.members).toBeNull();
    expect(platformOnly.accounts).not.toBeNull();
    // An owner that is not the person's leaves nothing to show.
    const notMine = await dashboard(collegeOffice, `?owner=${DEFAULT_ORGANISATION}`);
    expect(Object.values(notMine).every((part) => part === null)).toBe(true);
    await h.http().get('/api/v1/admin/dashboard?owner=nonsense').set(as(collegeOffice)).expect(400);
  });
});
