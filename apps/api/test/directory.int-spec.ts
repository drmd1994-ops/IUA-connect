import sharp from 'sharp';
import {
  type Harness,
  bearer,
  createVerifiedUser,
  signIn,
  signInAdmin,
  startHarness,
} from './auth-harness';

/**
 * M7 checkpoint 4: the opt-in member directory (D9) and the consent behind it. Everyone here is
 * fictional. Each test names its people with its own tag and searches by it, so earlier runs
 * don't show up.
 */
describe('member directory (integration)', () => {
  let h: Harness;
  let admin: { accessToken: string };
  let types: Record<string, string>;
  let viewer: Person;
  const run = Date.now().toString(36);
  let n = 0;
  /** A name part no other test or run uses. Letters only, so it survives normalisation. */
  const tag = () => `zq${run}${(++n).toString(36)}x`;

  interface Person {
    id: string;
    email: string;
    token: string;
    membershipId: string | null;
  }

  beforeAll(async () => {
    h = await startHarness();
    admin = await signInAdmin(h, 'directory-admin');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    viewer = await member();
  });

  afterAll(async () => {
    await h.close();
  });

  async function person(membershipType: string | null = null): Promise<Person> {
    const email = await createVerifiedUser(h, 'directory');
    let membershipId: string | null = null;
    if (membershipType) {
      const created = await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(bearer(admin.accessToken))
        .send({ email, typeId: types[membershipType] })
        .expect(201);
      membershipId = created.body.membership.id;
    }
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { id: rows[0]!.id, email, token: (await signIn(h, email)).accessToken, membershipId };
  }
  const member = () => person('HONORARY_MEMBER');
  const endMembership = (p: Person, how: 'suspend' | 'expire') =>
    h
      .http()
      .post(`/api/v1/admin/memberships/${p.membershipId}/${how}`)
      .set(bearer(admin.accessToken))
      .send(how === 'suspend' ? { reason: 'Test' } : {})
      .expect(200);
  const profile = (p: Person, body: object) =>
    h.http().patch('/api/v1/me/profile').set(bearer(p.token)).send(body).expect(200);
  const consent = (p: Person, granted: boolean) =>
    h.http().post('/api/v1/me/consents').set(bearer(p.token)).send({ kind: 'DIRECTORY', granted });
  /** A member with a name that holds `name`, listed in the directory. */
  async function listed(name: string, extra: object = {}): Promise<Person> {
    const p = await member();
    await profile(p, { firstName: 'Dana', lastName: `Fictional ${name}`, ...extra });
    await consent(p, true).expect(200);
    return p;
  }
  const list = (token: string, query = '') =>
    h.http().get(`/api/v1/members${query}`).set(bearer(token));
  const get = (token: string, id: string) =>
    h.http().get(`/api/v1/members/${id}`).set(bearer(token));
  const ids = async (query: string) =>
    ((await list(viewer.token, query).expect(200)).body.items as { id: string }[]).map(
      (item) => item.id,
    );

  describe('who may read it', () => {
    it('needs a signed-in account with an active membership', async () => {
      const name = tag();
      const target = await listed(name);
      await h.http().get('/api/v1/members').expect(401);
      await h.http().get(`/api/v1/members/${target.id}`).expect(401);

      const noMembership = await person();
      const suspended = await member();
      await endMembership(suspended, 'suspend');
      const expired = await member();
      await endMembership(expired, 'expire');
      for (const reader of [noMembership, suspended, expired]) {
        const refused = await list(reader.token, `?q=${name}`).expect(403);
        expect(refused.body.error.details[0].code).toBe('membersOnly');
        // The same refusal for a listed member and for an address that never existed.
        await get(reader.token, target.id).expect(403);
        await get(reader.token, '0190a000-0000-7000-8000-00000000c0de').expect(403);
      }
      // An administrator without a membership uses the admin members screen instead.
      await list(admin.accessToken, `?q=${name}`).expect(403);

      expect(await ids(`?q=${name}`)).toEqual([target.id]);
    });
  });

  describe('opting in', () => {
    it('is off until the member switches it on, and needs a name', async () => {
      const name = tag();
      const p = await member();
      const start = await h.http().get('/api/v1/me/consents').set(bearer(p.token)).expect(200);
      expect(start.body.directory).toEqual({
        granted: false,
        version: 'directory-2026-10',
        grantedAt: null,
      });
      const refused = await consent(p, true).expect(422);
      expect(refused.body.error.details[0].code).toBe('directoryNameRequired');

      await profile(p, { firstName: 'Noa', lastName: `Fictional ${name}` });
      expect(await ids(`?q=${name}`)).toEqual([]);
      const granted = await consent(p, true).expect(200);
      expect(granted.body.directory).toMatchObject({ granted: true, version: 'directory-2026-10' });
      expect(granted.body.directory.grantedAt).not.toBeNull();
      // Asking again changes nothing.
      await consent(p, true).expect(200);
      expect(await ids(`?q=${name}`)).toEqual([p.id]);
    });

    it('withdrawing takes the member off the list at once, and the history is kept', async () => {
      const name = tag();
      const p = await listed(name);
      expect(await ids(`?q=${name}`)).toEqual([p.id]);
      const withdrawn = await consent(p, false).expect(200);
      expect(withdrawn.body.directory).toMatchObject({ granted: false, grantedAt: null });
      expect(await ids(`?q=${name}`)).toEqual([]);
      await get(viewer.token, p.id).expect(404);

      await consent(p, true).expect(200);
      expect(await ids(`?q=${name}`)).toEqual([p.id]);
      const { rows } = await h.db.query<{ version: string; withdrawn: boolean }>(
        `SELECT version, withdrawn_at IS NOT NULL AS withdrawn FROM consents
         WHERE user_id = $1 AND kind = 'DIRECTORY' ORDER BY granted_at`,
        [p.id],
      );
      expect(rows).toEqual([
        { version: 'directory-2026-10', withdrawn: true },
        { version: 'directory-2026-10', withdrawn: false },
      ]);
      const audit = await h.db.query<{ action: string }>(
        `SELECT action FROM audit_logs WHERE entity_id = $1 AND action LIKE 'consent.%' ORDER BY at`,
        [p.id],
      );
      expect(audit.rows.map((row) => row.action)).toEqual([
        'consent.grant',
        'consent.withdraw',
        'consent.grant',
      ]);
    });

    it('refuses other kinds of consent and needs a signed-in account', async () => {
      const p = await member();
      await h.http().get('/api/v1/me/consents').expect(401);
      await h
        .http()
        .post('/api/v1/me/consents')
        .send({ kind: 'DIRECTORY', granted: true })
        .expect(401);
      await h
        .http()
        .post('/api/v1/me/consents')
        .set(bearer(p.token))
        .send({ kind: 'EMAIL_MARKETING', granted: true })
        .expect(400);
    });
  });

  describe('who is listed', () => {
    it('only members who opted in and whose membership is active', async () => {
      const name = tag();
      const optedIn = await listed(name);
      const notOptedIn = await member();
      await profile(notOptedIn, { firstName: 'Dana', lastName: `Fictional ${name}` });
      const suspended = await listed(name);
      await endMembership(suspended, 'suspend');
      const expired = await listed(name);
      await endMembership(expired, 'expire');
      // Opted in before ever having a membership.
      const noMembership = await person();
      await profile(noMembership, { firstName: 'Dana', lastName: `Fictional ${name}` });
      await consent(noMembership, true).expect(200);

      expect(await ids(`?q=${name}`)).toEqual([optedIn.id]);
    });

    it('not listed, not active and never existed all look the same', async () => {
      const name = tag();
      const notOptedIn = await member();
      await profile(notOptedIn, { firstName: 'Dana', lastName: `Fictional ${name}` });
      const suspended = await listed(name);
      await endMembership(suspended, 'suspend');
      const expired = await listed(name);
      await endMembership(expired, 'expire');
      const answers = [];
      for (const id of [
        notOptedIn.id,
        suspended.id,
        expired.id,
        '0190a000-0000-7000-8000-00000000c0de',
      ]) {
        const res = await get(viewer.token, id).expect(404);
        const { correlationId: _correlationId, ...error } = res.body.error;
        answers.push(error);
      }
      expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
      expect(answers[0]).toMatchObject({ code: 'NOT_FOUND' });
      await get(viewer.token, 'not-an-id').expect(400);
    });
  });

  describe('what is shown', () => {
    it('the name always; every other field only when its owner shows it to members', async () => {
      const name = tag();
      const hospitals = (await h.http().get('/api/v1/hospitals').expect(200)).body.items;
      const subs = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items;
      const everything = {
        nameHe: 'דנה בדויה',
        nameEn: 'Dana Fictional',
        title: 'Dr.',
        position: 'Consultant',
        hospitalId: hospitals[0].id,
        departmentId: null,
        subspecialtyIds: [subs[0].id],
        bio: 'A fictional biography.',
        researchInterests: 'Fictional research.',
        orcid: '0000-0002-1825-0097',
        languages: ['he', 'en'],
        contactEmail: 'dana@example.test',
        contactPhone: '+972500000000',
      };
      const closed = await listed(name, everything);
      const open = await listed(name, {
        ...everything,
        visibility: {
          NAME_HE: 'MEMBERS',
          TITLE: 'MEMBERS',
          POSITION: 'PUBLIC',
          INSTITUTION: 'MEMBERS',
          SUBSPECIALTIES: 'MEMBERS',
          BIO: 'MEMBERS',
          LANGUAGES: 'PUBLIC',
          CONTACT_EMAIL: 'MEMBERS',
        },
      });

      const hidden = (await get(viewer.token, closed.id).expect(200)).body;
      expect(hidden).toEqual({
        id: closed.id,
        firstName: 'Dana',
        lastName: `Fictional ${name}`,
        nameHe: null,
        nameEn: null,
        title: null,
        position: null,
        hospital: null,
        department: null,
        subspecialties: [],
        photoFileId: null,
        bio: null,
        researchInterests: null,
        orcid: null,
        languages: [],
        contactEmail: null,
        contactPhone: null,
      });

      const shown = (await get(viewer.token, open.id).expect(200)).body;
      expect(shown).toMatchObject({
        nameHe: 'דנה בדויה',
        nameEn: null,
        title: 'Dr.',
        position: 'Consultant',
        hospital: { id: hospitals[0].id },
        subspecialties: [{ id: subs[0].id }],
        bio: 'A fictional biography.',
        researchInterests: null,
        orcid: null,
        languages: ['he', 'en'],
        contactEmail: 'dana@example.test',
        contactPhone: null,
      });

      // The list carries the summary only: no biography or contact details.
      const page = (await list(viewer.token, `?q=${name}`).expect(200)).body;
      expect(page).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      for (const item of page.items) {
        expect(item).not.toHaveProperty('bio');
        expect(item).not.toHaveProperty('contactEmail');
        expect(item).not.toHaveProperty('contactPhone');
      }
    });

    it('a photo is readable by members only when its owner shows it', async () => {
      const name = tag();
      const p = await listed(name);
      const jpeg = await sharp({
        create: { width: 40, height: 30, channels: 3, background: '#224466' },
      })
        .jpeg()
        .toBuffer();
      const photo = (
        await h
          .http()
          .put('/api/v1/me/profile/photo')
          .set(bearer(p.token))
          .attach('file', jpeg, 'me.jpg')
          .expect(200)
      ).body.photo.id as string;
      const url = (token: string) => h.http().get(`/api/v1/files/${photo}/url`).set(bearer(token));

      expect((await get(viewer.token, p.id).expect(200)).body.photoFileId).toBeNull();
      await url(viewer.token).expect(404);
      await profile(p, { visibility: { PHOTO: 'MEMBERS' } });
      expect((await get(viewer.token, p.id).expect(200)).body.photoFileId).toBe(photo);
      await url(viewer.token).expect(200);
      // Not for someone without an active membership, and not once the member leaves the list.
      await url((await person()).token).expect(404);
      await consent(p, false).expect(200);
      await url(viewer.token).expect(404);
    });
  });

  describe('searching', () => {
    it('finds by part of the name, in either order, whatever the letter case', async () => {
      const name = tag();
      const p = await listed(name);
      expect(await ids(`?q=${name.toUpperCase()}`)).toEqual([p.id]);
      expect(await ids(`?q=${encodeURIComponent(`dana fictional ${name}`)}`)).toEqual([p.id]);
      expect(await ids(`?q=${encodeURIComponent(`${name} dana`)}`)).toEqual([p.id]);
      expect(await ids(`?q=${name}nothing`)).toEqual([]);
      // Characters that mean something to the database are just text.
      expect(await ids(`?q=${encodeURIComponent('%_')}`)).toEqual([]);
      await list(viewer.token, '?q=a').expect(400);
    });

    it('a name the member keeps private can’t be found by typing it', async () => {
      const name = tag();
      const hebrew = `שָׁלוֹם ${name}`;
      const p = await listed(tag(), { nameHe: hebrew });
      expect(await ids(`?q=${name}`)).toEqual([]);
      await profile(p, { visibility: { NAME_HE: 'MEMBERS' } });
      expect(await ids(`?q=${name}`)).toEqual([p.id]);
      // Hebrew is compared without vowel marks and with final letters folded.
      expect(await ids(`?q=${encodeURIComponent(`שלומ ${name}`)}`)).toEqual([p.id]);
      expect(await ids(`?q=${encodeURIComponent(`שלום ${name}`)}`)).toEqual([p.id]);
    });

    it('filters by hospital and subspecialty only for members who show them', async () => {
      const name = tag();
      const hospital = (await h.http().get('/api/v1/hospitals').expect(200)).body.items[1];
      const sub = (await h.http().get('/api/v1/subspecialties').expect(200)).body.items[1];
      const place = { hospitalId: hospital.id, departmentId: null, subspecialtyIds: [sub.id] };
      const shows = await listed(name, {
        ...place,
        visibility: { INSTITUTION: 'MEMBERS', SUBSPECIALTIES: 'PUBLIC' },
      });
      await listed(name, place);

      expect(await ids(`?q=${name}&hospitalId=${hospital.id}`)).toEqual([shows.id]);
      expect(await ids(`?q=${name}&subspecialtyId=${sub.id}`)).toEqual([shows.id]);
      expect((await ids(`?q=${name}`)).length).toBe(2);
    });

    it('gives 20 per page and no way to ask for more', async () => {
      await list(viewer.token, '?pageSize=500').expect(400);
      await list(viewer.token, '?page=0').expect(400);
      const page = (await list(viewer.token).expect(200)).body;
      expect(page.pageSize).toBe(20);
      expect(page.items.length).toBeLessThanOrEqual(20);
    });
  });
});

/** API_DESIGN.md §5: the directory allows 30 requests a minute per person. */
describe('member directory: rate limit', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness({ rateLimits: true }); // fresh counters per test
  });

  afterEach(async () => {
    await h.close();
  });

  it('stops one person after 30 requests a minute, and nobody else', async () => {
    const token = async () =>
      (await signIn(h, await createVerifiedUser(h, 'rl-directory'))).accessToken;
    const first = await token();
    const second = await token();
    // These people have no membership, so each request is refused, and still counted.
    for (let i = 0; i < 30; i++) {
      await h.http().get('/api/v1/members').set(bearer(first)).expect(403);
    }
    const limited = await h.http().get('/api/v1/members').set(bearer(first)).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Looking at single members counts toward the same limit.
    await h
      .http()
      .get('/api/v1/members/0190a000-0000-7000-8000-00000000c0de')
      .set(bearer(first))
      .expect(429);
    await h.http().get('/api/v1/members').set(bearer(second)).expect(403);
  });
});
