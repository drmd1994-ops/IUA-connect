import { randomBytes } from 'node:crypto';
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
  verifyPhysician,
} from './auth-harness';

/**
 * M16: the platform stands by itself, and an organisation has a section of its own. This suite
 * is the readers' side, with two organisations (the society, which is the default one, and a
 * college made here) and the platform's own content:
 *
 * - the four viewing settings, as a table of who sees what;
 * - "a verified person who belongs to no organisation can use the platform", and nothing of an
 *   organisation's section;
 * - "a member of A does not see B's members-only content; a person in neither sees neither".
 *
 * The staff's side is in organisation-staff.int-spec.ts.
 */
describe('the platform and its organisations, as readers see them (integration)', () => {
  let h: Harness;
  type Staff = { accessToken: string };
  let college: { id: string; slug: string; typeId: string };
  let societyTypes: Record<string, string>;
  const offices = {} as Record<'society' | 'college', Staff>;
  const editors = {} as Record<'society' | 'college' | 'platform', Staff>;
  let platformAdmin: Staff;
  const word = randomBytes(5).toString('hex');
  const as = (who: Staff) => bearer(who.accessToken);

  interface Person {
    email: string;
    token: string;
    id: string;
  }
  const readers = {} as Record<
    'account' | 'physician' | 'societyFull' | 'societyStudent' | 'fellow' | 'both' | 'formerFellow',
    Person
  >;
  type Reader = keyof typeof readers | 'anonymous';
  const READERS: Reader[] = [
    'anonymous',
    'account',
    'physician',
    'societyFull',
    'societyStudent',
    'fellow',
    'both',
    'formerFellow',
  ];

  let n = 0;
  async function person(label: string): Promise<Person> {
    const email = await createVerifiedUser(h, label);
    const token = (await signIn(h, email)).accessToken;
    await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(token))
      .send({ firstName: 'Dana', lastName: `Fictional ${word}${++n}` })
      .expect(200);
    const { rows } = await h.db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { email, token, id: rows[0]!.id };
  }
  async function join(who: Person, organisation: 'society' | 'college', typeKey = 'STUDENT') {
    const res = await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as(offices[organisation]))
      .send({
        email: who.email,
        typeId: organisation === 'college' ? college.typeId : societyTypes[typeKey],
        ...(organisation === 'society' && typeKey === 'FULL_MEMBER'
          ? { identifier: String(300_000_000 + Math.floor(Math.random() * 600_000_000)) }
          : {}),
      })
      .expect(201);
    return res.body.membership.id as string;
  }
  const read = (who: Reader, path: string) => {
    const req = h.http().get(path);
    return who === 'anonymous' ? req : req.set(bearer(readers[who].token));
  };

  beforeAll(async () => {
    h = await startHarness();
    college = await createOrganisation(h, 'college');
    const types = await h
      .http()
      .get(`/api/v1/membership-types?organisation=${DEFAULT_ORGANISATION}`)
      .expect(200);
    societyTypes = Object.fromEntries(
      (types.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    offices.society = await signInOrganisationAdmin(h, DEFAULT_ORGANISATION, 'society-office');
    offices.college = await signInOrganisationAdmin(h, college.id, 'college-office');
    platformAdmin = await signInPlatformAdmin(h);
    editors.society = await signInWithMfa(h, 'society-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', DEFAULT_ORGANISATION),
    );
    editors.college = await signInWithMfa(h, 'college-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', college.id),
    );
    editors.platform = await signInWithMfa(h, 'platform-editor', (email) =>
      grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
    );

    // An account nobody has verified.
    readers.account = await person('account');
    // A physician the platform knows, in no organisation.
    readers.physician = await person('physician');
    await verifyPhysician(h, readers.physician.email);
    readers.societyFull = await person('society-full');
    await join(readers.societyFull, 'society', 'FULL_MEMBER');
    readers.societyStudent = await person('society-student');
    await join(readers.societyStudent, 'society', 'STUDENT');
    readers.fellow = await person('fellow');
    await join(readers.fellow, 'college');
    readers.both = await person('both');
    await join(readers.both, 'society', 'STUDENT');
    await join(readers.both, 'college');
    // Was a fellow; the college suspended the membership. Still a physician the platform knows.
    readers.formerFellow = await person('former-fellow');
    const membership = await join(readers.formerFellow, 'college');
    await h
      .http()
      .post(`/api/v1/admin/memberships/${membership}/suspend`)
      .set(as(offices.college))
      .send({ reason: 'Test' })
      .expect(200);
  });

  afterAll(async () => {
    await h.close();
  });

  // --- The organisations themselves -------------------------------------------------------------

  describe('the organisations', () => {
    it('are listed for anyone: who they are, nothing about their members', async () => {
      const list = await h.http().get('/api/v1/organisations').expect(200);
      const mine = (list.body.items as { id: string }[]).find((item) => item.id === college.id);
      expect(mine).toEqual({
        id: college.id,
        slug: college.slug,
        nameHe: expect.any(String),
        nameEn: expect.any(String),
        descriptionHe: null,
        descriptionEn: null,
      });
      for (const address of [college.slug, college.id]) {
        expect((await h.http().get(`/api/v1/organisations/${address}`).expect(200)).body.id).toBe(
          college.id,
        );
      }
      await h.http().get('/api/v1/organisations/no-such-organisation').expect(404);
    });

    it('one that is not active shows nowhere, and its cards stop verifying', async () => {
      const closing = await createOrganisation(h, 'closing');
      const office = await signInOrganisationAdmin(h, closing.id, 'closing-office');
      const member = await person('closing-member');
      await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(as(office))
        .send({ email: member.email, typeId: closing.typeId })
        .expect(201);
      const card = await h
        .http()
        .get(`/api/v1/me/membership/card-token?organisation=${closing.id}`)
        .set(bearer(member.token))
        .expect(200);
      const verify = () =>
        h.http().get('/api/v1/card/verify').query({ t: card.body.token }).expect(200);
      expect((await verify()).body).toMatchObject({
        valid: true,
        organisation: { id: closing.id },
      });

      await h.db.query('UPDATE organisations SET active = false WHERE id = $1', [closing.id]);
      await h.http().get(`/api/v1/organisations/${closing.slug}`).expect(404);
      const list = await h.http().get('/api/v1/organisations').expect(200);
      expect((list.body.items as { id: string }[]).map((item) => item.id)).not.toContain(
        closing.id,
      );
      expect((await verify()).body).toEqual({
        valid: false,
        name: null,
        organisation: null,
        type: null,
      });
      const types = await h.http().get('/api/v1/membership-types').expect(200);
      expect(JSON.stringify(types.body)).not.toContain(closing.id);
      // The person is still a physician the platform knows.
      const me = await h.http().get('/api/v1/me').set(bearer(member.token)).expect(200);
      expect(me.body.verified).toBe(true);
      expect(
        (await h.http().get('/api/v1/me/memberships').set(bearer(member.token)).expect(200)).body
          .items,
      ).toEqual([]);
    });
  });

  // --- Who sees what ----------------------------------------------------------------------------

  type Owner = 'society' | 'college' | 'platform';
  type Tier = 'PUBLIC' | 'VERIFIED' | 'MEMBERS' | 'TYPES';
  interface Item {
    owner: Owner;
    tier: Tier;
    name: string;
  }
  /**
   * Every item of the table. The society's "types" item is for its full members; the college's
   * for its one type; the platform's own names the college's type. The platform has no
   * "members" setting: it has no members.
   */
  const ITEMS: Item[] = (['society', 'college', 'platform'] as const).flatMap((owner) =>
    (['PUBLIC', 'VERIFIED', 'MEMBERS', 'TYPES'] as const)
      .filter((tier) => !(owner === 'platform' && tier === 'MEMBERS'))
      .map((tier) => ({ owner, tier, name: `${owner}:${tier}` })),
  );
  const tierInput = (item: Item) => ({
    accessTier: item.tier,
    ...(item.tier === 'TYPES'
      ? { typeIds: [item.owner === 'society' ? societyTypes.FULL_MEMBER : college.typeId] }
      : {}),
  });

  /** The table, written out: for each reader, the items they see. */
  const sees = (reader: Reader, item: Item): boolean => {
    const verified = !['anonymous', 'account'].includes(reader);
    const inSociety = ['societyFull', 'societyStudent', 'both'].includes(reader);
    const inCollege = ['fellow', 'both'].includes(reader);
    switch (item.tier) {
      case 'PUBLIC':
        return true;
      case 'VERIFIED':
        return verified;
      case 'MEMBERS':
        return item.owner === 'society' ? inSociety : inCollege;
      case 'TYPES':
        // The society's names its full members; the college's and the platform's, the fellows.
        return item.owner === 'society' ? reader === 'societyFull' : inCollege;
    }
  };

  it('the table says what it should about the people this milestone is for', () => {
    const names = (reader: Reader) =>
      ITEMS.filter((item) => sees(reader, item)).map((item) => item.name);
    expect(names('anonymous')).toEqual(['society:PUBLIC', 'college:PUBLIC', 'platform:PUBLIC']);
    expect(names('account')).toEqual(names('anonymous'));
    // A verified person in no organisation: everything for verified people, nothing for members.
    expect(names('physician')).toEqual([
      'society:PUBLIC',
      'society:VERIFIED',
      'college:PUBLIC',
      'college:VERIFIED',
      'platform:PUBLIC',
      'platform:VERIFIED',
    ]);
    // Leaving an organisation leaves the platform as it was.
    expect(names('formerFellow')).toEqual(names('physician'));
    expect(names('societyStudent')).toEqual(
      [...names('physician'), 'society:MEMBERS'].sort(byItem),
    );
    expect(names('fellow')).not.toContain('society:MEMBERS');
    expect(names('fellow')).toContain('platform:TYPES');
  });
  function byItem(a: string, b: string): number {
    const order = ITEMS.map((item) => item.name);
    return order.indexOf(a) - order.indexOf(b);
  }

  describe('news', () => {
    const slugs: Record<string, string> = {};
    const tag = `t${word}`;

    beforeAll(async () => {
      for (const item of ITEMS) {
        const created = await h
          .http()
          .post('/api/v1/admin/news')
          .set(as(editors[item.owner]))
          .send({
            translations: {
              he: { title: `ידיעה ${word} ${item.name}`, body: 'גוף', summary: 'תקציר' },
            },
            tags: [tag],
            ...tierInput(item),
          })
          .expect(201);
        const step = (who: Staff, action: string) =>
          h
            .http()
            .post(`/api/v1/admin/news/${created.body.id}/transitions`)
            .set(as(who))
            .send({ action })
            .expect(200);
        await step(editors[item.owner], 'SUBMIT');
        await step(item.owner === 'platform' ? platformAdmin : offices[item.owner], 'PUBLISH');
        slugs[item.name] = created.body.slug;
      }
    });

    for (const reader of READERS) {
      it(`${reader}: sees its own part of the list, by link, in search and in notices`, async () => {
        const expected = ITEMS.filter((item) => sees(reader, item)).map((item) => item.name);
        const list = await read(reader, `/api/v1/news?tag=${tag}&pageSize=50`).expect(200);
        const listed = (list.body.items as { slug: string }[]).map((item) => item.slug);
        expect(
          ITEMS.filter((item) => listed.includes(slugs[item.name]!)).map((i) => i.name),
        ).toEqual(expected);
        expect(list.body.total).toBe(expected.length);
        for (const item of ITEMS) {
          const res = await read(reader, `/api/v1/news/${encodeURIComponent(slugs[item.name]!)}`);
          expect([item.name, res.status]).toEqual([item.name, sees(reader, item) ? 200 : 404]);
        }
        // Search never finds what the reader may not open.
        const found = await read(reader, `/api/v1/search?q=${word}&types=news`).expect(200);
        const group = (found.body.groups as { type: string; total: number }[]).find(
          (g) => g.type === 'news',
        );
        expect(group?.total ?? 0).toBe(expected.length);
      });
    }

    it('says who published each item, and lists one organisation’s news by itself', async () => {
      const item = await read(
        'both',
        `/api/v1/news/${encodeURIComponent(slugs['college:MEMBERS']!)}`,
      );
      expect(item.body.organisation).toMatchObject({ id: college.id, slug: college.slug });
      const own = await read(
        'both',
        `/api/v1/news/${encodeURIComponent(slugs['platform:PUBLIC']!)}`,
      );
      expect(own.body.organisation).toBeNull();
      const section = await read('both', `/api/v1/news?organisation=${college.id}&pageSize=50`);
      expect(
        (section.body.items as { organisation: { id: string } }[]).map((i) => i.organisation.id),
      ).toEqual([college.id, college.id, college.id, college.id]);
      // The same address shows a non-member only what is open to them.
      const outside = await read('societyFull', `/api/v1/news?organisation=${college.id}`);
      expect(outside.body.total).toBe(2);
    });

    it('announces an organisation’s members-only item to its members only', async () => {
      const titles = async (reader: Exclude<Reader, 'anonymous'>) =>
        (
          (
            await h
              .http()
              .get('/api/v1/notifications?pageSize=50')
              .set(bearer(readers[reader].token))
              .expect(200)
          ).body.items as { params: { titleHe?: string } }[]
        ).map((item) => item.params.titleHe);
      const title = (name: string) => `ידיעה ${word} ${name}`;
      expect(await titles('fellow')).toContain(title('college:MEMBERS'));
      expect(await titles('both')).toContain(title('college:MEMBERS'));
      for (const reader of ['societyFull', 'physician', 'formerFellow', 'account'] as const) {
        expect(await titles(reader)).not.toContain(title('college:MEMBERS'));
        expect(await titles(reader)).not.toContain(title('college:TYPES'));
      }
      expect(await titles('physician')).toContain(title('platform:VERIFIED'));
      expect(await titles('account')).not.toContain(title('platform:VERIFIED'));
      expect(await titles('account')).toContain(title('platform:PUBLIC'));
    });
  });

  describe('events', () => {
    const slugs: Record<string, string> = {};

    beforeAll(async () => {
      const eventStaff = {
        society: offices.society,
        college: offices.college,
        platform: platformAdmin,
      };
      for (const [index, item] of ITEMS.entries()) {
        const created = await h
          .http()
          .post('/api/v1/admin/events')
          .set(as(eventStaff[item.owner]))
          .send({
            startAt: new Date(Date.UTC(2033, 1, 1 + index, 7)).toISOString(),
            endAt: new Date(Date.UTC(2033, 1, 1 + index, 16)).toISOString(),
            locationName: 'Example Hall',
            registrationMode: 'INTERNAL',
            translations: { he: { title: `אירוע ${word} ${item.name}` } },
            ...tierInput(item),
          })
          .expect(201);
        await h
          .http()
          .post(`/api/v1/admin/events/${created.body.id}/publish`)
          .set(as(eventStaff[item.owner]))
          .expect(200);
        slugs[item.name] = created.body.slug;
      }
    });

    for (const reader of READERS) {
      it(`${reader}: opens, registers for and finds only what is for them`, async () => {
        for (const item of ITEMS) {
          const path = `/api/v1/events/${encodeURIComponent(slugs[item.name]!)}`;
          const res = await read(reader, path);
          expect([item.name, res.status]).toEqual([item.name, sees(reader, item) ? 200 : 404]);
          if (reader !== 'anonymous') {
            // Registering for an event one may not see is registering for nothing.
            const registered = await h
              .http()
              .post(`${path}/registration`)
              .set(bearer(readers[reader].token));
            expect([item.name, registered.status === 404]).toEqual([
              item.name,
              !sees(reader, item),
            ]);
          }
        }
        const section = await read(reader, `/api/v1/events?organisation=${college.id}&pageSize=50`);
        expect(section.body.total).toBe(
          ITEMS.filter((item) => item.owner === 'college' && sees(reader, item)).length,
        );
      });
    }
  });

  describe('the library, which is the platform’s', () => {
    it('opens to every verified physician, in an organisation or not', async () => {
      const created = await h
        .http()
        .post('/api/v1/admin/education')
        .set(as(editors.platform))
        .send({
          type: 'ARTICLE',
          accessTier: 'VERIFIED',
          translations: { he: { title: `מאמר ${word}`, description: 'טקסט.' } },
        })
        .expect(201);
      const step = (who: Staff, action: string) =>
        h
          .http()
          .post(`/api/v1/admin/education/${created.body.id}/transitions`)
          .set(as(who))
          .send({ action })
          .expect(200);
      await step(editors.platform, 'SUBMIT');
      await step(platformAdmin, 'PUBLISH');
      for (const reader of READERS) {
        const res = await read(reader, `/api/v1/education/${created.body.slug}`);
        const verified = !['anonymous', 'account'].includes(reader);
        expect([reader, res.status]).toEqual([reader, verified ? 200 : 404]);
      }
      // "Members" is not a setting the library has.
      const refused = await h
        .http()
        .post('/api/v1/admin/education')
        .set(as(editors.platform))
        .send({
          type: 'ARTICLE',
          accessTier: 'MEMBERS',
          translations: { he: { title: `מאמר ${word} 2`, description: 'טקסט.' } },
        })
        .expect(400);
      expect(refused.body.error.code).toBe('VALIDATION_FAILED');
      // And an organisation's editor has no hand in it.
      await h.http().get('/api/v1/admin/education').set(as(editors.college)).expect(403);
    });
  });

  // --- The platform for a verified person; an organisation's section for its members ------------

  describe('a verified person who belongs to no organisation', () => {
    it('uses the platform: directory, private chat and groups', async () => {
      const me = readers.physician;
      // Listed in the directory, by their own choice, and reads it.
      await h
        .http()
        .post('/api/v1/me/consents')
        .set(bearer(me.token))
        .send({ kind: 'DIRECTORY', granted: true })
        .expect(200);
      await h
        .http()
        .post('/api/v1/me/consents')
        .set(bearer(readers.fellow.token))
        .send({ kind: 'DIRECTORY', granted: true })
        .expect(200);
      const directory = await h
        .http()
        .get(`/api/v1/members?q=${word}`)
        .set(bearer(me.token))
        .expect(200);
      expect((directory.body.items as { id: string }[]).map((item) => item.id).sort()).toEqual(
        [me.id, readers.fellow.id].sort(),
      );
      // Writes to a member of an organisation, and is written to: chat is the platform's.
      const conversation = await h
        .http()
        .post('/api/v1/chat/conversations')
        .set(bearer(me.token))
        .send({ userId: readers.fellow.id })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/chat/conversations/${conversation.body.id}/messages`)
        .set(bearer(me.token))
        .send({ body: 'Hello from the platform' })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/chat/conversations/${conversation.body.id}/messages`)
        .set(bearer(readers.fellow.token))
        .send({ body: 'Hello back' })
        .expect(201);
      const group = await h
        .http()
        .post('/api/v1/chat/groups')
        .set(bearer(me.token))
        .send({ name: `Group ${word}`, userIds: [readers.fellow.id] });
      expect(group.status).toBe(201);
      // An account nobody verified has none of this.
      await h
        .http()
        .get(`/api/v1/members?q=${word}`)
        .set(bearer(readers.account.token))
        .expect(403);
      await h
        .http()
        .post('/api/v1/chat/conversations')
        .set(bearer(readers.account.token))
        .send({ userId: me.id })
        .expect(403);
    });

    it('has no membership, no card, and nothing of an organisation’s section', async () => {
      const token = readers.physician.token;
      const mine = await h.http().get('/api/v1/me/membership').set(bearer(token)).expect(200);
      expect(mine.body).toEqual({ membership: null, history: [] });
      expect(
        (await h.http().get('/api/v1/me/memberships').set(bearer(token)).expect(200)).body.items,
      ).toEqual([]);
      const card = await h
        .http()
        .get('/api/v1/me/membership/card-token')
        .set(bearer(token))
        .expect(422);
      expect(card.body.error.details[0].code).toBe('noActiveMembership');
      const me = await h.http().get('/api/v1/me').set(bearer(token)).expect(200);
      expect(me.body).toMatchObject({ verified: true, organisations: [], permissions: [] });
    });
  });

  describe('a person in two organisations', () => {
    it('holds a membership and a card in each, and says which they mean', async () => {
      const token = readers.both.token;
      const all = await h.http().get('/api/v1/me/memberships').set(bearer(token)).expect(200);
      expect(
        (all.body.items as { organisation: { id: string } }[]).map((m) => m.organisation.id).sort(),
      ).toEqual([DEFAULT_ORGANISATION, college.id].sort());

      // "My membership" and "my card" could be either: it must be said.
      const unsaid = await h.http().get('/api/v1/me/membership').set(bearer(token)).expect(400);
      expect(unsaid.body.error.details).toEqual([{ code: 'organisationRequired' }]);
      await h.http().get('/api/v1/me/membership/card-token').set(bearer(token)).expect(400);

      const one = await h
        .http()
        .get(`/api/v1/me/membership?organisation=${college.id}`)
        .set(bearer(token))
        .expect(200);
      expect(one.body.membership).toMatchObject({
        organisation: { id: college.id },
        type: { key: 'MEMBER' },
      });
      const card = await h
        .http()
        .get(`/api/v1/me/membership/card-token?organisation=${college.id}`)
        .set(bearer(token))
        .expect(200);
      const verified = await h
        .http()
        .get('/api/v1/card/verify')
        .query({ t: card.body.token })
        .expect(200);
      expect(verified.body).toMatchObject({ valid: true, organisation: { id: college.id } });
      await h
        .http()
        .get('/api/v1/me/membership?organisation=0190a000-0000-7000-8000-00000000c0de')
        .set(bearer(token))
        .expect(404);

      // A person in one organisation need not say which.
      const single = await h
        .http()
        .get('/api/v1/me/membership')
        .set(bearer(readers.fellow.token))
        .expect(200);
      expect(single.body.membership.organisation.id).toBe(college.id);
    });
  });

  // --- Rooms ------------------------------------------------------------------------------------

  describe('rooms', () => {
    const rooms = {} as Record<Owner, string>;
    const key = (who: Person) => bearer(who.token);

    beforeAll(async () => {
      const staff = { society: offices.society, college: offices.college, platform: platformAdmin };
      for (const owner of ['society', 'college', 'platform'] as const) {
        rooms[owner] = (
          await h
            .http()
            .post('/api/v1/admin/chat/rooms')
            .set(as(staff[owner]))
            .send({ nameHe: `חדר ${word} ${owner}` })
            .expect(201)
        ).body.id;
      }
    });

    const opens = (reader: Exclude<Reader, 'anonymous'>, owner: Owner): boolean => {
      if (owner === 'platform') return reader !== 'account';
      if (owner === 'society') return ['societyFull', 'societyStudent', 'both'].includes(reader);
      return ['fellow', 'both'].includes(reader);
    };

    for (const reader of READERS.filter(
      (r): r is Exclude<Reader, 'anonymous'> => r !== 'anonymous',
    )) {
      it(`${reader}: the platform’s rooms when verified, an organisation’s when its member`, async () => {
        const who = readers[reader];
        const browse = await h.http().get(`/api/v1/chat/rooms?q=${word}`).set(key(who));
        if (reader === 'account') {
          // No place among rooms at all.
          expect(browse.status).toBe(403);
          expect(browse.body.error.details[0].code).toBe('membersOnly');
        } else {
          expect(browse.status).toBe(200);
          const listed = (browse.body.items as { id: string }[]).map((item) => item.id);
          expect(
            (['society', 'college', 'platform'] as const).filter((o) => listed.includes(rooms[o])),
          ).toEqual((['society', 'college', 'platform'] as const).filter((o) => opens(reader, o)));
          // Asking for one organisation's rooms narrows the list; it never opens it.
          const narrowed = await h
            .http()
            .get(`/api/v1/chat/rooms?q=${word}&organisation=${college.id}`)
            .set(key(who))
            .expect(200);
          expect((narrowed.body.items as { id: string }[]).map((item) => item.id)).toEqual(
            opens(reader, 'college') ? [rooms.college] : [],
          );
        }
        for (const owner of ['society', 'college', 'platform'] as const) {
          const room = await h.http().get(`/api/v1/chat/rooms/${rooms[owner]}`).set(key(who));
          const joined = await h
            .http()
            .post(`/api/v1/chat/rooms/${rooms[owner]}/join`)
            .set(key(who));
          if (opens(reader, owner)) {
            expect([owner, room.status, joined.status]).toEqual([owner, 200, 200]);
            // The room says whose it is.
            expect(room.body.organisation?.id ?? null).toBe(
              owner === 'platform' ? null : owner === 'college' ? college.id : DEFAULT_ORGANISATION,
            );
            await h
              .http()
              .post(`/api/v1/chat/rooms/${rooms[owner]}/messages`)
              .set(key(who))
              .send({ body: `Hello ${reader}` })
              .expect(201);
          } else if (reader === 'account') {
            expect([owner, room.status, joined.status]).toEqual([owner, 403, 403]);
          } else {
            // Another organisation's room is simply not there.
            expect([owner, room.status, joined.status]).toEqual([owner, 404, 404]);
            await h
              .http()
              .get(`/api/v1/chat/rooms/${rooms[owner]}/messages`)
              .set(key(who))
              .expect(404);
          }
        }
      });
    }

    it('someone whose membership ends keeps reading the room they were in, and can’t write', async () => {
      const leaving = await person('leaving');
      const membership = await join(leaving, 'college');
      await h.http().post(`/api/v1/chat/rooms/${rooms.college}/join`).set(key(leaving)).expect(200);
      await h
        .http()
        .post(`/api/v1/admin/memberships/${membership}/suspend`)
        .set(as(offices.college))
        .send({ reason: 'Test' })
        .expect(200);
      const room = await h
        .http()
        .get(`/api/v1/chat/rooms/${rooms.college}`)
        .set(key(leaving))
        .expect(200);
      expect(room.body.sendState).toBe('membersOnly');
      await h
        .http()
        .post(`/api/v1/chat/rooms/${rooms.college}/messages`)
        .set(key(leaving))
        .send({ body: 'After' })
        .expect(403);
      // The platform's room is theirs as before.
      await h
        .http()
        .post(`/api/v1/chat/rooms/${rooms.platform}/join`)
        .set(key(leaving))
        .expect(200);
      await h
        .http()
        .post(`/api/v1/chat/rooms/${rooms.platform}/messages`)
        .set(key(leaving))
        .send({ body: 'Still on the platform' })
        .expect(201);
    });

    it('a room by invitation of an organisation takes only its members', async () => {
      const invited = (
        await h
          .http()
          .post('/api/v1/admin/chat/rooms')
          .set(as(offices.college))
          .send({ nameHe: `חדר בהזמנה ${word}`, inviteOnly: true })
          .expect(201)
      ).body.id as string;
      const invite = (userIds: string[]) =>
        h
          .http()
          .post(`/api/v1/chat/rooms/${invited}/invitations`)
          .set(as(offices.college))
          .send({ userIds });
      // A fellow can be invited; a physician outside the college looks like nobody.
      await invite([readers.fellow.id]).expect(204);
      await invite([readers.physician.id]).expect(404);
      await invite([readers.societyFull.id]).expect(404);
    });
  });
});
