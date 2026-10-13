import { randomBytes } from 'node:crypto';
import {
  DEFAULT_ORGANISATION,
  type Harness,
  bearer,
  createVerifiedUser,
  grantRole,
  signIn,
  signInAdmin,
  signInWithMfa,
  startHarness,
} from './auth-harness';

/**
 * M7 checkpoint 5: global search. The items are fictional and written for these tests. Every
 * title carries a word no other run uses, in Latin and in Hebrew letters, and the queries
 * include it, so only this run's items compete for the first place.
 */
describe('search (integration)', () => {
  let h: Harness;
  let editor: { accessToken: string };
  let admin: { accessToken: string };
  let types: Record<string, string>;
  // Random, so the words of one run don't look like a typing mistake of another run's.
  const run = randomBytes(6).toString('hex');
  /** A run-unique word in Latin letters, and one in Hebrew letters. */
  const tag = `${run}zq`;
  const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';
  const hebrewTag = [...randomBytes(12)]
    .map((byte) => HEBREW_LETTERS[byte % HEBREW_LETTERS.length])
    .join('');
  const as = (who: { accessToken: string }) => bearer(who.accessToken);

  interface Group {
    type: string;
    total: number;
    items: { id: string; title: string; excerpt: string | null; link: string; locale: string }[];
  }
  const search = (q: string, extra = '', token?: string) => {
    const req = h.http().get(`/api/v1/search?q=${encodeURIComponent(q)}${extra}`);
    return token ? req.set(bearer(token)) : req;
  };
  const groups = async (q: string, extra = '', token?: string) =>
    (await search(q, extra, token).expect(200)).body.groups as Group[];
  /** The titles found for one type, best first. */
  const titles = async (type: string, q: string, token?: string) =>
    (await groups(q, `&types=${type}`, token))[0]?.items.map((item) => item.title) ?? [];

  async function news(text: { title: string; summary?: string; body?: string }, extra = {}) {
    const created = await h
      .http()
      .post('/api/v1/admin/news')
      .set(as(editor))
      .send({
        organisationId: DEFAULT_ORGANISATION,
        translations: {
          he: { title: text.title, summary: text.summary ?? 'תקציר', body: text.body ?? 'גוף' },
        },
        ...extra,
      })
      .expect(201);
    const step = (who: { accessToken: string }, action: string) =>
      h
        .http()
        .post(`/api/v1/admin/news/${created.body.id}/transitions`)
        .set(as(who))
        .send({ action })
        .expect(200);
    await step(editor, 'SUBMIT');
    await step(admin, 'PUBLISH');
    return created.body as { id: string; slug: string };
  }
  const guideline = (title: string, extra = {}) =>
    h
      .http()
      .post('/api/v1/admin/guidelines')
      .set(as(admin))
      .send({
        sourceOrg: 'Example Urology Society (fictional)',
        officialUrl: 'https://guidelines.example.test/search',
        translations: { en: { title, summary: 'A fictional summary.' } },
        version: { version: '2030', publishedOn: '2030-03-01' },
        ...extra,
      })
      .expect(201);
  async function member(typeKey: string) {
    const email = await createVerifiedUser(h, 'searcher');
    await h
      .http()
      .post('/api/v1/admin/memberships')
      .set(as(admin))
      .send({ email, typeId: types[typeKey] })
      .expect(201);
    return (await signIn(h, email)).accessToken;
  }

  const TITLES = {
    meeting: `הכנס השנתי של האיגוד ${tag}`,
    board: `סיכום ישיבת הוועד ${tag}`,
    pediatric: `אורולוגיה ילדים: עדכון ${tag}`,
    marked: `שָׁלוֹם לְחַבְרֵי הָאִגּוּד ${tag}`,
    stones: `אבנים בדרכי השתן ${tag}`,
    unique: `טיפול ${hebrewTag} בקהילה`,
  };

  beforeAll(async () => {
    h = await startHarness();
    editor = await signInWithMfa(h, 'search-editor', (email) =>
      // The organisation's news, and the platform's library.
      Promise.all([
        grantRole(h, email, 'CONTENT_EDITOR'),
        grantRole(h, email, 'CONTENT_EDITOR', 'platform'),
      ]).then(() => undefined),
    );
    admin = await signInAdmin(h, 'search-admin');
    const res = await h.http().get('/api/v1/membership-types').expect(200);
    types = Object.fromEntries(
      (res.body.items as { key: string; id: string }[]).map((t) => [t.key, t.id]),
    );
    await news({ title: TITLES.meeting, summary: 'ההרשמה נפתחה', body: 'פרטים **נוספים** בהמשך.' });
    // The word "כנס" appears here in the body only.
    await news({ title: TITLES.board, body: `הוחלט על מועד הכנס הבא. ${tag}` });
    await news({ title: TITLES.pediatric });
    await news({ title: TITLES.marked });
    await news({ title: TITLES.stones });
    await news({ title: TITLES.unique });
  }, 120_000);

  afterAll(async () => {
    await h.close();
  });

  describe('Hebrew relevance spot checks', () => {
    it('a word in the title ranks above the same word in the text', async () => {
      expect(await titles('news', `כנס ${tag}`)).toEqual([TITLES.meeting, TITLES.board]);
    });

    it('finds a word typed without its prefix, with it, or with another prefix', async () => {
      // The title says "הכנס" (the meeting).
      expect((await titles('news', `כנס ${tag}`))[0]).toBe(TITLES.meeting);
      expect((await titles('news', `הכנס ${tag}`))[0]).toBe(TITLES.meeting);
      expect((await titles('news', `בכנס ${tag}`))[0]).toBe(TITLES.meeting);
      expect((await titles('news', `לכנס השנתי ${tag}`))[0]).toBe(TITLES.meeting);
    });

    it('finds a word from its start', async () => {
      expect(await titles('news', `אורול ${tag}`)).toEqual([TITLES.pediatric]);
    });

    it('ignores vowel marks, in the text and in the query', async () => {
      expect(await titles('news', `שלום לחברי ${tag}`)).toEqual([TITLES.marked]);
      expect(await titles('news', `אֲבָנִים ${tag}`)).toEqual([TITLES.stones]);
    });

    it('treats final letters like regular ones', async () => {
      // "אבנים" ends with a final mem; typed without it, it is the same word.
      expect(await titles('news', `אבנימ ${tag}`)).toEqual([TITLES.stones]);
      expect(await titles('news', `שלומ ${tag}`)).toEqual([TITLES.marked]);
    });

    it('needs every word, and finds nothing for words that are not there', async () => {
      expect(await titles('news', `כנס אבנים ${tag}`)).toEqual([]);
      expect(await titles('news', `מילהשאיננה ${tag}`)).toEqual([]);
    });

    it('tolerates a small typing mistake in a title word', async () => {
      const typo = hebrewTag.slice(0, 5) + hebrewTag.slice(6);
      expect(typo).not.toBe(hebrewTag);
      expect((await titles('news', typo))[0]).toBe(TITLES.unique);
    });

    it('answers an English query', async () => {
      await guideline(`Fictional stone guideline ${tag}`);
      expect(await titles('guidelines', `STONE ${tag}`)).toEqual([
        `Fictional stone guideline ${tag}`,
      ]);
      expect(await titles('guidelines', `fict ston ${tag}`)).toEqual([
        `Fictional stone guideline ${tag}`,
      ]);
    });
  });

  describe('what a result holds', () => {
    it('a title, a plain-text excerpt and a path, grouped by type', async () => {
      const found = await groups(`כנס השנתי ${tag}`);
      expect(found.map((group) => group.type)).toEqual(['news']);
      expect(found[0]).toMatchObject({ type: 'news', total: 1 });
      expect(found[0]!.items[0]).toMatchObject({
        title: TITLES.meeting,
        excerpt: 'ההרשמה נפתחה',
        locale: 'he',
      });
      expect(found[0]!.items[0]!.link).toMatch(/^\/news\//);
    });

    it('finds an event by the title of one of its sessions, and an education item', async () => {
      const created = await h
        .http()
        .post('/api/v1/admin/events')
        .set(as(admin))
        .send({
          organisationId: DEFAULT_ORGANISATION,
          startAt: new Date(Date.UTC(2031, 5, 10, 7)).toISOString(),
          endAt: new Date(Date.UTC(2031, 5, 10, 16)).toISOString(),
          locationName: 'Example Hall',
          registrationMode: 'NONE',
          translations: { he: { title: `יום עיון ${tag}` } },
        })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/admin/events/${created.body.id}/sessions`)
        .set(as(admin))
        .send({
          startAt: new Date(Date.UTC(2031, 5, 10, 8)).toISOString(),
          endAt: new Date(Date.UTC(2031, 5, 10, 9)).toISOString(),
          translations: { he: { title: `סדנת לפרוסקופיה ${hebrewTag}` } },
        })
        .expect(201);
      await h
        .http()
        .post(`/api/v1/admin/events/${created.body.id}/publish`)
        .set(as(admin))
        .expect(200);
      expect(await titles('events', `לפרוסקופיה ${hebrewTag}`)).toEqual([`יום עיון ${tag}`]);

      const lesson = await h
        .http()
        .post('/api/v1/admin/education')
        .set(as(editor))
        .send({
          type: 'ARTICLE',
          translations: { he: { title: `מאמר לחיפוש ${tag}`, description: '## כותרת\n\nטקסט.' } },
        })
        .expect(201);
      for (const [who, action] of [
        [editor, 'SUBMIT'],
        [admin, 'PUBLISH'],
      ] as const) {
        await h
          .http()
          .post(`/api/v1/admin/education/${lesson.body.id}/transitions`)
          .set(as(who))
          .send({ action })
          .expect(200);
      }
      const education = (await groups(`מאמר לחיפוש ${tag}`, '&types=education'))[0]!;
      expect(education.items[0]).toMatchObject({ title: `מאמר לחיפוש ${tag}` });
      // Markdown marks are not shown in the excerpt.
      expect(education.items[0]!.excerpt).not.toContain('#');
      expect(education.items[0]!.link).toMatch(/^\/education\//);
    });

    it('shows five per type at first, and pages when one type is opened', async () => {
      const word = `${randomBytes(6).toString('hex')}paging`;
      for (let i = 0; i < 12; i++) await guideline(`${word} guideline ${i}`);
      const overview = await groups(word);
      expect(overview[0]).toMatchObject({ type: 'guidelines', total: 12 });
      expect(overview[0]!.items).toHaveLength(5);

      const first = (await search(word, '&types=guidelines').expect(200)).body;
      expect(first).toMatchObject({ page: 1, pageSize: 10 });
      expect(first.groups[0].items).toHaveLength(10);
      const second = (await search(word, '&types=guidelines&page=2').expect(200)).body;
      expect(second.groups[0].items).toHaveLength(2);
      const seen = [...first.groups[0].items, ...second.groups[0].items].map(
        (item: { id: string }) => item.id,
      );
      expect(new Set(seen).size).toBe(12);
    });
  });

  describe('what a reader may not open is not found', () => {
    it('follows the access tiers, in results and in counts', async () => {
      const word = `${randomBytes(6).toString('hex')}tiers`;
      await news({ title: `פתוח ${word}` });
      await news({ title: `לחברים ${word}` }, { accessTier: 'MEMBERS' });
      await news(
        { title: `למלאים ${word}` },
        { accessTier: 'TYPES', typeIds: [types.HONORARY_MEMBER] },
      );
      const visitor = (await signIn(h, await createVerifiedUser(h, 'visitor'))).accessToken;
      const honorary = await member('HONORARY_MEMBER');
      const student = await member('STUDENT');
      const found = async (token?: string) => {
        const group = (await groups(word, '&types=news', token))[0];
        return { total: group?.total ?? 0, titles: group?.items.map((item) => item.title).sort() };
      };
      expect(await found()).toEqual({ total: 1, titles: [`פתוח ${word}`] });
      expect(await found(visitor)).toEqual({ total: 1, titles: [`פתוח ${word}`] });
      expect(await found(student)).toEqual({
        total: 2,
        titles: [`לחברים ${word}`, `פתוח ${word}`].sort(),
      });
      expect((await found(honorary)).total).toBe(3);
    });

    it('never finds a draft or an item that was not published', async () => {
      const word = `${randomBytes(6).toString('hex')}draft`;
      await h
        .http()
        .post('/api/v1/admin/news')
        .set(as(editor))
        .send({
          organisationId: DEFAULT_ORGANISATION,
          translations: { he: { title: `טיוטה ${word}`, body: 'גוף', summary: 'תקציר' } },
        })
        .expect(201);
      expect(await groups(word)).toEqual([]);
      expect(await groups(word, '', admin.accessToken)).toEqual([]);
    });

    it('finds members only for an active member', async () => {
      const word = `${randomBytes(6).toString('hex')}member`;
      const listedEmail = await createVerifiedUser(h, 'listed');
      await h
        .http()
        .post('/api/v1/admin/memberships')
        .set(as(admin))
        .send({ email: listedEmail, typeId: types.HONORARY_MEMBER })
        .expect(201);
      const listed = (await signIn(h, listedEmail)).accessToken;
      await h
        .http()
        .patch('/api/v1/me/profile')
        .set(bearer(listed))
        .send({ firstName: 'Dana', lastName: `Fictional ${word}`, title: 'Dr.' })
        .expect(200);
      await h
        .http()
        .post('/api/v1/me/consents')
        .set(bearer(listed))
        .send({ kind: 'DIRECTORY', granted: true })
        .expect(200);

      const activeMember = await member('STUDENT');
      const found = await groups(word, '', activeMember);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'members', total: 1 });
      expect(found[0]!.items[0]).toMatchObject({ title: `Dana Fictional ${word}` });
      expect(found[0]!.items[0]!.link).toMatch(/^\/members\/[0-9a-f-]{36}$/);
      // The title is private, so it isn't shown in the excerpt.
      expect(found[0]!.items[0]!.excerpt).toBeNull();

      const visitor = (await signIn(h, await createVerifiedUser(h, 'visitor'))).accessToken;
      expect(await groups(word)).toEqual([]);
      expect(await groups(word, '', visitor)).toEqual([]);
      expect(await groups(word, '&types=members', visitor)).toEqual([]);
      // An administrator without a membership is not a member either.
      expect(await groups(word, '&types=members', admin.accessToken)).toEqual([]);
    });
  });

  describe('what is typed is only text', () => {
    it('search operators, quotes and wildcards change nothing', async () => {
      for (const q of [`' OR 1=1 --`, `${tag} | !כנס`, 'a:* & b:*', '%%__', '((((', `"${tag}"`]) {
        await search(q).expect(200);
      }
      // An "or" operator is not an operator: both words are still needed.
      expect(await titles('news', `כנס | אבנים ${tag}`)).toEqual([]);
    });

    it('refuses a query that is too short, too long or names an unknown type', async () => {
      await h.http().get('/api/v1/search').expect(400);
      await search('a').expect(400);
      await search('x'.repeat(101)).expect(400);
      await search(tag, '&types=news,secrets').expect(400);
      await search(tag, '&page=0').expect(400);
      // Only punctuation: nothing to search for, and nothing found.
      expect((await search('!!').expect(200)).body.groups).toEqual([]);
    });
  });
});

/** M7 plan §3: 60 searches a minute per person or address. */
describe('search: rate limit', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await startHarness({ rateLimits: true }); // fresh counters per test
  });

  afterEach(async () => {
    await h.close();
  });

  it('stops an address after 60 searches a minute', async () => {
    for (let i = 0; i < 60; i++) {
      await h.http().get('/api/v1/search?q=nothing-here&types=guidelines').expect(200);
    }
    const limited = await h
      .http()
      .get('/api/v1/search?q=nothing-here&types=guidelines')
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('a search that includes members counts toward the directory limit of the person', async () => {
    const token = (await signIn(h, await createVerifiedUser(h, 'rl-search'))).accessToken;
    for (let i = 0; i < 30; i++) {
      await h.http().get('/api/v1/search?q=nobody&types=members').set(bearer(token)).expect(200);
    }
    await h.http().get('/api/v1/search?q=nobody&types=members').set(bearer(token)).expect(429);
    // Searching content only is still allowed.
    await h.http().get('/api/v1/search?q=nobody&types=news').set(bearer(token)).expect(200);
    await h.http().get('/api/v1/members').set(bearer(token)).expect(429);
  });
});
