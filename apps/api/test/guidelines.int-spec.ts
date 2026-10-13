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
  verifyPhysician,
} from './auth-harness';

/** M3 checkpoint 6: guidelines (metadata, versions, summaries) under the access tiers. */
describe('guidelines (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let types: Record<string, string>;
  let subspecialty: { id: string; key: string };
  // A fictional source name, unique per run: the test database persists between runs.
  const org = `Test Urology Society ${Date.now()}`;

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'guidelines-admin');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    const subs = await h.http().get('/api/v1/subspecialties').expect(200);
    subspecialty = subs.body.items[0];
  });

  afterAll(async () => {
    await h.close();
  });

  const input = (extra: object = {}) => ({
    sourceOrg: org,
    officialUrl: 'https://guidelines.example.test/stones',
    evidenceLevel: 'Strong',
    translations: { en: { title: 'Urolithiasis', summary: 'A short summary.' } },
    version: { version: '2025', publishedOn: '2025-03-01' },
    ...extra,
  });
  const create = async (extra: object = {}) =>
    (
      await h
        .http()
        .post('/api/v1/admin/guidelines')
        .set(bearer(admin.accessToken))
        .send(input(extra))
        .expect(201)
    ).body as { id: string; versions: { id: string; version: string }[] };
  const read = (token: string | null, path: string) => {
    const req = h.http().get(path);
    return token ? req.set(bearer(token)) : req;
  };

  it('is admin-only to manage, and closed to content editors', async () => {
    const created = await create();
    await expectAdminOnly(h, 'get', '/api/v1/admin/guidelines');
    await expectAdminOnly(h, 'post', '/api/v1/admin/guidelines', input());
    await expectAdminOnly(h, 'get', `/api/v1/admin/guidelines/${created.id}`);
    const { version: _version, ...metadata } = input();
    await expectAdminOnly(h, 'put', `/api/v1/admin/guidelines/${created.id}`, metadata);
    await expectAdminOnly(h, 'delete', `/api/v1/admin/guidelines/${created.id}`);
    await expectAdminOnly(h, 'post', `/api/v1/admin/guidelines/${created.id}/versions`, {
      version: '2026',
      publishedOn: '2026-03-01',
    });
    await expectAdminOnly(
      h,
      'delete',
      `/api/v1/admin/guidelines/${created.id}/versions/${created.versions[0]!.id}`,
    );

    const editor = await signInWithMfa(h, 'editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR'),
    );
    await h.http().get('/api/v1/admin/guidelines').set(bearer(editor.accessToken)).expect(403);
  });

  it('creates a guideline with its first version, and audits it', async () => {
    const created = await create({ subspecialtyId: subspecialty.id });
    expect(created).toMatchObject({
      sourceOrg: org,
      status: 'CURRENT',
      accessTier: 'PUBLIC',
      evidenceLevel: 'Strong',
      subspecialtyId: subspecialty.id,
      translations: { en: { title: 'Urolithiasis', summary: 'A short summary.' } },
      versions: [{ version: '2025', publishedOn: '2025-03-01', url: null }],
    });
    const audit = await h.db.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'guideline' AND entity_id = $1`,
      [created.id],
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual(['guideline.create']);

    const list = await h
      .http()
      .get(`/api/v1/admin/guidelines?q=${encodeURIComponent(org)}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(created.id);
  });

  it('rejects unsafe links, unknown subspecialties and a TYPES tier without types', async () => {
    const post = (extra: object) =>
      h.http().post('/api/v1/admin/guidelines').set(bearer(admin.accessToken)).send(input(extra));
    await post({ officialUrl: 'javascript:alert(1)' }).expect(400);
    await post({
      version: { version: '1', publishedOn: '2025-03-01', url: 'ftp://x.test/a' },
    }).expect(400);
    await post({ translations: {} }).expect(400);
    await post({ accessTier: 'TYPES' }).expect(400);
    const unknown = await post({ subspecialtyId: '018f0000-0000-7000-8000-000000000000' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details[0].code).toBe('unknownSubspecialty');
  });

  it('keeps a version history: newest first, unique names, never empty', async () => {
    const created = await create();
    const versions = `/api/v1/admin/guidelines/${created.id}/versions`;
    const added = await h
      .http()
      .post(versions)
      .set(bearer(admin.accessToken))
      .send({
        version: '2026',
        publishedOn: '2026-03-01',
        url: 'https://guidelines.example.test/stones/2026',
        licenseNote: 'Linked only',
      })
      .expect(201);
    expect(added.body.versions.map((v: { version: string }) => v.version)).toEqual([
      '2026',
      '2025',
    ]);
    const twice = await h
      .http()
      .post(versions)
      .set(bearer(admin.accessToken))
      .send({ version: '2026', publishedOn: '2026-04-01' })
      .expect(409);
    expect(twice.body.error.details[0].code).toBe('guidelineVersionTaken');

    const publicView = await read(null, `/api/v1/guidelines/${created.id}?locale=en`).expect(200);
    expect(publicView.body).toMatchObject({ version: '2026', publishedOn: '2026-03-01' });
    expect(publicView.body.versions).toHaveLength(2);

    const newest = added.body.versions[0].id as string;
    await h.http().delete(`${versions}/${newest}`).set(bearer(admin.accessToken)).expect(200);
    const last = await h
      .http()
      .delete(`${versions}/${created.versions[0]!.id}`)
      .set(bearer(admin.accessToken))
      .expect(422);
    expect(last.body.error.details[0].code).toBe('guidelineLastVersion');
  });

  it('updates the metadata and status, falls back between languages, and deletes', async () => {
    const created = await create();
    const en = await read(null, `/api/v1/guidelines/${created.id}?locale=he`).expect(200);
    expect(en.body).toMatchObject({ title: 'Urolithiasis', locale: 'en', fallback: true });

    const { version: _version, ...metadata } = input();
    const updated = await h
      .http()
      .put(`/api/v1/admin/guidelines/${created.id}`)
      .set(bearer(admin.accessToken))
      .send({
        ...metadata,
        status: 'SUPERSEDED',
        evidenceLevel: '',
        translations: { he: { title: 'אבני דרכי השתן' }, en: { title: 'Urolithiasis' } },
      })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'SUPERSEDED', evidenceLevel: null });
    expect(updated.body.versions).toHaveLength(1);

    const he = await read(null, `/api/v1/guidelines/${created.id}?locale=he`).expect(200);
    expect(he.body).toMatchObject({
      title: 'אבני דרכי השתן',
      locale: 'he',
      fallback: false,
      status: 'SUPERSEDED',
      summary: null,
    });

    await h
      .http()
      .delete(`/api/v1/admin/guidelines/${created.id}`)
      .set(bearer(admin.accessToken))
      .expect(204);
    await read(null, `/api/v1/guidelines/${created.id}`).expect(404);
    await h
      .http()
      .get(`/api/v1/admin/guidelines/${created.id}`)
      .set(bearer(admin.accessToken))
      .expect(404);
  });

  describe('access tiers', () => {
    const ids: Record<'public' | 'verified' | 'full', string> = {
      public: '',
      verified: '',
      full: '',
    };
    const readers: Record<string, string | null> = {};
    let subKey = '';

    async function member(typeKey: string, then?: 'suspend' | 'expire'): Promise<string> {
      const email = await createVerifiedUser(h, 'reader');
      const created = await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(bearer(admin.accessToken))
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
          .set(bearer(admin.accessToken))
          .send(then === 'suspend' ? { reason: 'Test' } : {})
          .expect(200);
      }
      return (await signIn(h, email)).accessToken;
    }

    beforeAll(async () => {
      // A subspecialty filter narrows the public list; the three items are told apart by ID.
      subKey = subspecialty.key;
      ids.public = (await create({ subspecialtyId: subspecialty.id })).id;
      ids.verified = (await create({ subspecialtyId: subspecialty.id, accessTier: 'VERIFIED' })).id;
      ids.full = (
        await create({
          subspecialtyId: subspecialty.id,
          accessTier: 'TYPES',
          typeIds: [types.FULL_MEMBER],
        })
      ).id;
      readers.anonymous = null;
      // An account the platform does not know as a physician's.
      readers.noMembership = (await signIn(h, await createVerifiedUser(h, 'reader'))).accessToken;
      // A physician the platform knows, in no organisation.
      const verifiedEmail = await createVerifiedUser(h, 'reader');
      await verifyPhysician(h, verifiedEmail);
      readers.verified = (await signIn(h, verifiedEmail)).accessToken;
      readers.full = await member('FULL_MEMBER');
      readers.student = await member('STUDENT');
      readers.suspended = await member('FULL_MEMBER', 'suspend');
      readers.expired = await member('FULL_MEMBER', 'expire');
    });

    const expected: Record<string, ('public' | 'verified' | 'full')[]> = {
      anonymous: ['public'],
      noMembership: ['public'],
      verified: ['public', 'verified'],
      full: ['public', 'verified', 'full'],
      student: ['public', 'verified'],
      suspended: ['public', 'verified'],
      expired: ['public', 'verified'],
    };

    for (const [who, visible] of Object.entries(expected)) {
      it(`${who}: sees ${visible.join(', ')} in the list and by link, and nothing else`, async () => {
        const list = await read(
          readers[who]!,
          `/api/v1/guidelines?subspecialty=${subKey}&pageSize=50`,
        ).expect(200);
        const listed = (list.body.items as { id: string }[]).map((i) => i.id);
        for (const key of ['public', 'verified', 'full'] as const) {
          const shown = visible.includes(key);
          // Newest first and 50 per page: this run's three items are on the first page.
          expect(listed.includes(ids[key])).toBe(shown);
          const res = await read(readers[who]!, `/api/v1/guidelines/${ids[key]}`);
          expect(res.status).toBe(shown ? 200 : 404);
        }
      });
    }
  });
});
