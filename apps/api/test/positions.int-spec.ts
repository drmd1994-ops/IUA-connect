import {
  type Harness,
  bearer,
  createOrganisation,
  createVerifiedUser,
  expectAdminOnly,
  grantDepartmentRole,
  signIn,
  signInAdmin,
  signInOrganisationAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/** M28: jobs, fellowships and research posts. Every place and position here is made up. */
describe('positions (integration)', () => {
  let h: Harness;
  let writer: { accessToken: string; userId: string };
  let reviewer: { accessToken: string };
  let admin: { accessToken: string };
  let subspecialties: { id: string; key: string }[];
  const run = Date.now().toString(36);
  let n = 0;
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  beforeAll(async () => {
    h = await startHarness();
    writer = await signInAdmin(h, 'positions-writer');
    reviewer = await signInAdmin(h, 'positions-reviewer');
    admin = reviewer;
    subspecialties = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items;
  });

  afterAll(async () => {
    await h.close();
  });

  /** A date `days` from today, "YYYY-MM-DD". */
  const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  /** A position abroad, open for 30 days. */
  const position = (extra: Record<string, unknown> = {}) => {
    const tag = `${run}-${++n}`;
    return {
      organisationId: null,
      kind: 'FELLOWSHIP',
      institutionName: `Made-up Institute ${tag}`,
      city: 'Lyon',
      country: 'FR',
      applyEmail: `fellowship-${tag}@example.test`,
      closesOn: day(30),
      subspecialtyIds: [subspecialties[0]!.id],
      translations: {
        he: { title: `השתלמות ${tag}`, body: 'תיאור' },
        en: { title: `Fellowship ${tag}`, body: 'A description' },
      },
      ...extra,
    };
  };

  async function place() {
    const hospital = await h
      .http()
      .post('/api/v1/admin/institutions/hospitals')
      .set(as(admin))
      .send({ nameHe: 'בית חולים', nameEn: `Hospital ${run}`, cityHe: 'עיר', cityEn: 'Town' })
      .expect(201);
    const department = await h
      .http()
      .post(`/api/v1/admin/institutions/hospitals/${hospital.body.id}/departments`)
      .set(as(admin))
      .send({ nameHe: 'אורולוגיה', nameEn: 'Urology' })
      .expect(201);
    return { hospitalId: hospital.body.id as string, departmentId: department.body.id as string };
  }

  const create = (who: { accessToken: string }, body: object) =>
    h.http().post('/api/v1/admin/positions').set(as(who)).send(body);
  const step = (who: { accessToken: string }, id: string, body: object) =>
    h.http().post(`/api/v1/admin/positions/${id}/transitions`).set(as(who)).send(body);

  async function published(body: Record<string, unknown> = position()) {
    const item = (await create(writer, body).expect(201)).body as { id: string };
    await step(writer, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    return item;
  }

  it('keeps the staff pages for staff', async () => {
    await expectAdminOnly(h, 'get', '/api/v1/admin/positions');
  });

  it('shows a position only after someone else reviews it, then to everyone', async () => {
    const body = position();
    const item = (await create(writer, body).expect(201)).body;
    expect(item).toMatchObject({ status: 'DRAFT', canWrite: true, canReview: true });
    await h.http().get(`/api/v1/positions/${item.id}`).expect(404);

    await step(writer, item.id, { action: 'SUBMIT' }).expect(200);
    const own = await step(writer, item.id, { action: 'PUBLISH' }).expect(403);
    expect(own.body.error.details[0].code).toBe('ownSubmission');
    const sent = await step(reviewer, item.id, { action: 'SEND_BACK' }).expect(400);
    expect(sent.body.error.details[0].code).toBe('commentRequired');

    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    // A visitor reads it, and finds it in the list.
    const read = await h.http().get(`/api/v1/positions/${item.id}`).expect(200);
    expect(read.body).toMatchObject({
      kind: 'FELLOWSHIP',
      place: { hospital: null, institutionName: body.institutionName, country: 'FR' },
      applyEmail: body.applyEmail,
      closed: false,
      saved: false,
    });
    const list = await h.http().get('/api/v1/positions').query({ q: body.institutionName });
    expect(list.body.items.map((p: { id: string }) => p.id)).toEqual([item.id]);
    expect(list.body.countries).toContain('FR');

    // Announced once, for the "New positions" notices.
    const { rows } = await h.db.query(
      "SELECT kind FROM content_announcements WHERE entity_type = 'position' AND entity_id = $1",
      [item.id],
    );
    expect(rows).toEqual([{ kind: 'POSITIONS' }]);
    // The writer is told.
    const notices = await h.db.query(
      "SELECT type FROM notifications WHERE user_id = $1 AND type = 'positionPublished'",
      [writer.userId],
    );
    expect(notices.rowCount).toBeGreaterThan(0);
  });

  it('takes a position off the list after its closing date, and keeps its page', async () => {
    const item = await published(position({ closesOn: day(-1) }));
    const list = await h.http().get('/api/v1/positions').query({ pageSize: 100 });
    expect(list.body.items.map((p: { id: string }) => p.id)).not.toContain(item.id);
    const read = await h.http().get(`/api/v1/positions/${item.id}`).expect(200);
    expect(read.body.closed).toBe(true);
  });

  it('searches by kind, subspecialty, country and who it is for', async () => {
    const tag = `search-${run}`;
    const job = await published(
      position({
        kind: 'JOB',
        institutionName: `${tag} Clinic`,
        country: 'DE',
        city: 'Berlin',
        audience: 'SPECIALISTS',
        subspecialtyIds: [subspecialties[1]!.id],
      }),
    );
    const research = await published(
      position({ kind: 'RESEARCH', institutionName: `${tag} Lab`, audience: 'RESIDENTS' }),
    );
    const ids = async (query: object) =>
      (
        await h
          .http()
          .get('/api/v1/positions')
          .query({ q: tag, ...query })
          .expect(200)
      ).body.items.map((p: { id: string }) => p.id);
    expect(await ids({})).toEqual(expect.arrayContaining([job.id, research.id]));
    expect(await ids({ kind: 'JOB' })).toEqual([job.id]);
    expect(await ids({ country: 'de' })).toEqual([job.id]);
    expect(await ids({ audience: 'RESIDENTS' })).toEqual([research.id]);
    expect(await ids({ subspecialty: subspecialties[1]!.key })).toEqual([job.id]);
  });

  it('lets a director post for their own department only, for the platform to review', async () => {
    const mine = await place();
    const other = await place();
    const director = await signInWithMfa(h, 'positions-director', (email) =>
      grantDepartmentRole(h, email, 'DEPARTMENT_DIRECTOR', mine.departmentId),
    );
    const scope = await h.http().get('/api/v1/admin/positions/scope').set(as(director)).expect(200);
    expect(scope.body).toMatchObject({ platform: false, organisations: [], review: false });
    expect(scope.body.departments.map((d: { id: string }) => d.id)).toEqual([mine.departmentId]);

    const atHospital = (where: { hospitalId: string; departmentId: string }) =>
      position({
        ...where,
        institutionName: null,
        city: null,
        country: 'IL',
        organisationId: undefined,
      });
    const refused = await create(director, atHospital(other)).expect(400);
    expect(refused.body.error.details[0].code).toBe('notYourDepartment');

    const item = (await create(director, atHospital(mine)).expect(201)).body;
    expect(item).toMatchObject({ organisation: null, canWrite: true, canReview: false });
    expect(item.place.hospital.id).toBe(mine.hospitalId);
    await step(director, item.id, { action: 'SUBMIT' }).expect(200);
    const cannot = await step(director, item.id, { action: 'PUBLISH' }).expect(403);
    expect(cannot.body.error.details[0].code).toBe('positionActionNotAllowed');

    // The director sees their own, not the platform's other positions.
    const theirs = await h.http().get('/api/v1/admin/positions').set(as(director)).expect(200);
    expect(theirs.body.items.map((p: { id: string }) => p.id)).toEqual([item.id]);
    const platformOne = await published();
    await h.http().get(`/api/v1/admin/positions/${platformOne.id}`).set(as(director)).expect(404);

    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    await h.http().get(`/api/v1/positions/${item.id}`).expect(200);
  });

  it('keeps an organisation to its own positions', async () => {
    const org = await createOrganisation(h, 'positions-org');
    const office = await signInOrganisationAdmin(h, org.id, 'positions-office');
    const colleague = await signInOrganisationAdmin(h, org.id, 'positions-office2');
    const platformOne = await published();
    await h.http().get(`/api/v1/admin/positions/${platformOne.id}`).set(as(office)).expect(404);
    const refused = await create(office, position({ organisationId: null })).expect(400);
    expect(refused.body.error.details[0].code).toBe('unknownOrganisation');

    const item = (await create(office, position({ organisationId: undefined })).expect(201)).body;
    expect(item.organisation.id).toBe(org.id);
    await step(office, item.id, { action: 'SUBMIT' }).expect(200);
    await step(colleague, item.id, { action: 'PUBLISH' }).expect(200);
    const read = await h.http().get(`/api/v1/positions/${item.id}`).expect(200);
    expect(read.body.organisation.id).toBe(org.id);
  });

  it('refuses a position without a way to apply, or with two places', async () => {
    await create(writer, position({ applyEmail: null })).expect(400);
    const { hospitalId } = await place();
    await create(writer, position({ hospitalId })).expect(400);
  });

  it('lets the writer take a position back to correct it, and archive it', async () => {
    const item = await published();
    await step(writer, item.id, { action: 'TAKE_BACK' }).expect(200);
    await h.http().get(`/api/v1/positions/${item.id}`).expect(404);
    const draft = await h.http().get(`/api/v1/admin/positions/${item.id}`).set(as(writer));
    const edited = position({ city: 'Paris' });
    await h
      .http()
      .put(`/api/v1/admin/positions/${item.id}`)
      .set(as(writer))
      .set('If-Match', `"${draft.body.version}"`)
      .send(edited)
      .expect(200);
    await step(writer, item.id, { action: 'SUBMIT' }).expect(200);
    await step(reviewer, item.id, { action: 'PUBLISH' }).expect(200);
    expect((await h.http().get(`/api/v1/positions/${item.id}`)).body.place.city).toBe('Paris');
    await step(writer, item.id, { action: 'ARCHIVE' }).expect(200);
    await h.http().get(`/api/v1/positions/${item.id}`).expect(404);
    const history = await h
      .http()
      .get(`/api/v1/admin/positions/${item.id}/history`)
      .set(as(writer));
    expect(history.body.items.map((e: { action: string }) => e.action)).toEqual([
      'create',
      'submit',
      'publish',
      'take_back',
      'submit',
      'publish',
      'archive',
    ]);
  });

  it('keeps a person’s saved positions to themselves', async () => {
    const item = await published();
    await h.http().put(`/api/v1/positions/${item.id}/saved`).expect(401);
    const reader = await signIn(h, await createVerifiedUser(h, 'positions-reader'));
    const other = await signIn(h, await createVerifiedUser(h, 'positions-other'));
    await h.http().put(`/api/v1/positions/${item.id}/saved`).set(as(reader)).expect(204);
    const mine = await h.http().get('/api/v1/positions/saved').set(as(reader)).expect(200);
    expect(mine.body.items.map((p: { id: string }) => p.id)).toEqual([item.id]);
    expect((await h.http().get(`/api/v1/positions/${item.id}`).set(as(reader))).body.saved).toBe(
      true,
    );
    const theirs = await h.http().get('/api/v1/positions/saved').set(as(other)).expect(200);
    expect(theirs.body.items).toEqual([]);
    await h.http().delete(`/api/v1/positions/${item.id}/saved`).set(as(reader)).expect(204);
    expect((await h.http().get('/api/v1/positions/saved').set(as(reader))).body.items).toEqual([]);
  });
});
