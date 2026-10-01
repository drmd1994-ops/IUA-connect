import { describe, expect, it } from 'vitest';
import {
  EXCERPT_LENGTH,
  excerptOf,
  extractConference,
  extractDocuments,
  extractNews,
  parseSiteDate,
} from './extract';
import { findPersonalData } from './personal-data';
import { parseRobots } from './robots';
import { type SourceList, runImport } from './run';
import { checkSource } from './sources';

const SITE = 'https://urology.ima.org.il';
/** A news source with a reviewed title that names nobody. */
const n = (url: string) => ({ url, title: 'כותרת שנבדקה', keepExcerpt: true });

// Small pages written for these tests, in the shape of the site's pages. Not copies of the site.
const newsPage = (body: string, date = '31.01.2026 | ') => `
  <html><body><h1 class="web-title">כותרת לדוגמה</h1>
  <main><article class="view-article-container">
    <div class="intro_article"><span id="ctl00_MainContent_spnDate" class="date">${date}</span>
      <span id="ctl00_MainContent_spnAuthor" class="authors"></span></div>
    <div class="view-article-summery"></div>
    ${body}
    <div id="ctl00_MainContent_dvWrapFile"><a id="ctl00_MainContent_hylFile" href="https://files.example.test/a.pdf">קישור</a></div>
  </article></main></body></html>`;

const listPage = `
  <html><body><main><div id="ctl00_MainContent_dvCategories">
    <div class="row dvCategories"><a class="categoriesPages__title" href="http://docs.example.test/one.pdf">נייר עמדה לדוגמה - 2016</a></div>
    <div class="row dvCategories"><a class="categoriesPages__title" href="files/two.pdf">הנחיה לדוגמה, 1999</a></div>
    <div class="row dvCategories"><a class="categoriesPages__title" href="javascript:alert(1)">קישור מסוכן</a></div>
    <div class="row dvCategories"><a class="categoriesPages__title" href="https://docs.example.test/three.pdf">ללא שנה</a></div>
  </div><a href="https://elsewhere.example.test/">footer link</a></main></body></html>`;

describe('the address allow-list', () => {
  it('accepts the hand-picked kinds of page', () => {
    expect(checkSource(`${SITE}/ViewArticle.aspx?aId=8399`, 'news')).toMatchObject({ ok: true });
    expect(checkSource(`${SITE}/ViewContent.aspx?CategoryId=9249`, 'guidelines')).toMatchObject({
      ok: true,
      kind: 'guidelines',
    });
    expect(
      checkSource(`${SITE}/ViewContent.aspx?CategoryId=9240`, 'position-papers'),
    ).toMatchObject({ ok: true });
    expect(checkSource(`${SITE}/ViewContent.aspx?CategoryId=9308`, 'conference')).toMatchObject({
      ok: true,
    });
  });

  it.each([
    ['the physician directory', 'https://www.ima.org.il/DoctorsIndex/', 'news'],
    ['a directory path on the site', `${SITE}/DoctorsIndex/?id=5`, 'news'],
    ['the members page', `${SITE}/Users.aspx?id=5`, 'news'],
    ['the sign-in page', `${SITE}/Login.aspx?x=1`, 'news'],
    ['a form', `${SITE}/Forms/ContactUs.aspx?a=1`, 'news'],
    ['the news list itself', `${SITE}/Articles.aspx`, 'news'],
    ['another host', 'https://example.test/ViewArticle.aspx?aId=1', 'news'],
    ['a look-alike host', 'https://urology.ima.org.il.example.test/ViewArticle.aspx?aId=1', 'news'],
    ['plain http', 'http://urology.ima.org.il/ViewArticle.aspx?aId=1', 'news'],
    ['extra parameters', `${SITE}/ViewArticle.aspx?aId=1&next=/Users.aspx`, 'news'],
    ['a non-numeric ID', `${SITE}/ViewArticle.aspx?aId=1%20OR%201`, 'news'],
    ['a document list named as news', `${SITE}/ViewContent.aspx?CategoryId=9249`, 'news'],
    [
      'a content page named as a guideline list',
      `${SITE}/ViewContent.aspx?CategoryId=9184`,
      'guidelines',
    ],
    ['a news page named as a conference', `${SITE}/ViewArticle.aspx?aId=1`, 'conference'],
    ['not an address', 'DoctorsIndex', 'news'],
  ] as const)('refuses %s', (_name, address, kind) => {
    expect(checkSource(address, kind).ok).toBe(false);
  });
});

describe('robots.txt', () => {
  const robots = parseRobots(
    [
      'User-agent: GPTBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow: /Users.aspx',
      'Disallow: /Forms/ContactUs.aspx',
      'Allow: /',
    ].join('\n'),
  );

  it('follows the rules for all crawlers, not another crawler’s', () => {
    expect(robots.allows('/ViewArticle.aspx?aId=1')).toBe(true);
    expect(robots.allows('/Users.aspx')).toBe(false);
    expect(robots.allows('/Forms/ContactUs.aspx?x=1')).toBe(false);
  });

  it('obeys a site that disallows everything', () => {
    expect(parseRobots('User-agent: *\nDisallow: /').allows('/ViewArticle.aspx?aId=1')).toBe(false);
  });

  it('allows everything when there are no rules', () => {
    expect(parseRobots('').allows('/anything')).toBe(true);
  });
});

describe('extraction', () => {
  it('reads the site’s dates', () => {
    expect(parseSiteDate('31.01.2026 | ')).toBe('2026-01-31');
    expect(parseSiteDate('1.2.2025')).toBe('2025-02-01');
    expect(parseSiteDate('31.02.2026')).toBeNull();
    expect(parseSiteDate('no date')).toBeNull();
  });

  it('keeps a short excerpt, cut at a word', () => {
    expect(excerptOf('  קצר  מאוד ')).toBe('קצר מאוד');
    expect(excerptOf('   ')).toBeNull();
    const long = excerptOf('מילה '.repeat(200))!;
    expect(long.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/מיל…$/);
  });

  it('reads a news page: title, date and the start of its own text only', () => {
    const item = extractNews(
      newsPage(
        '<p>פסקה ראשונה.</p><script>alert(1)</script><form><input value="x"></form><p>פסקה שנייה.</p>',
      ),
      `${SITE}/ViewArticle.aspx?aId=1`,
    );
    expect(item).toEqual({
      sourceUrl: `${SITE}/ViewArticle.aspx?aId=1`,
      title: 'כותרת לדוגמה',
      date: '2026-01-31',
      excerpt: 'פסקה ראשונה. פסקה שנייה.',
    });
  });

  it('has no excerpt when the page only links to a document', () => {
    expect(extractNews(newsPage(''), `${SITE}/ViewArticle.aspx?aId=2`).excerpt).toBeNull();
  });

  it('fails on a page without a date', () => {
    expect(() => extractNews(newsPage('', ''), `${SITE}/ViewArticle.aspx?aId=3`)).toThrow(
      'no date found',
    );
  });

  it('reads a document list: titles, years and links, never the footer or unsafe links', () => {
    const url = `${SITE}/ViewContent.aspx?CategoryId=9240`;
    expect(extractDocuments(listPage, url, 'position-papers')).toEqual([
      {
        sourceUrl: url,
        kind: 'position-papers',
        title: 'נייר עמדה לדוגמה - 2016',
        year: 2016,
        documentUrl: 'http://docs.example.test/one.pdf',
      },
      {
        sourceUrl: url,
        kind: 'position-papers',
        title: 'הנחיה לדוגמה, 1999',
        year: 1999,
        documentUrl: `${SITE}/files/two.pdf`,
      },
      {
        sourceUrl: url,
        kind: 'position-papers',
        title: 'ללא שנה',
        year: null,
        documentUrl: 'https://docs.example.test/three.pdf',
      },
    ]);
  });

  it('reads a conference page', () => {
    const html =
      '<h1 class="web-title">כנס לדוגמה</h1><div id="ctl00_MainContent_dvContent"><p>פרטים על הכנס.</p></div>';
    expect(extractConference(html, `${SITE}/ViewContent.aspx?CategoryId=9308`)).toEqual({
      sourceUrl: `${SITE}/ViewContent.aspx?CategoryId=9308`,
      title: 'כנס לדוגמה',
      excerpt: 'פרטים על הכנס.',
    });
  });
});

describe('the personal-data check', () => {
  it('finds email addresses, phone numbers and ID-like numbers', () => {
    expect(findPersonalData(['כתבו אל someone@example.test'])).toEqual(['email address']);
    expect(findPersonalData(['טלפון 052-1234567'])).toEqual(['phone number']);
    expect(findPersonalData(['טלפון 03-1234567'])).toEqual(['phone number']);
    expect(findPersonalData(['מספר 123456789'])).toEqual(['ID-like number']);
  });

  it('passes ordinary text with years and short numbers', () => {
    expect(findPersonalData(['נייר עמדה - 2016', 'מאמר 8399', null])).toEqual([]);
  });
});

describe('a run', () => {
  const robots = parseRobots('User-agent: *\nDisallow: /Users.aspx\nAllow: /');
  const sources = (extra: Partial<SourceList> = {}): SourceList => ({
    news: [n(`${SITE}/ViewArticle.aspx?aId=1`)],
    guidelines: [],
    positionPapers: [`${SITE}/ViewContent.aspx?CategoryId=9240`],
    conferences: [],
    ...extra,
  });

  it('fetches only the listed pages, once each, and builds the fixtures', async () => {
    const fetched: string[] = [];
    const result = await runImport(sources(), {
      robots,
      fetchPage: async (url) => {
        fetched.push(url);
        return url.includes('ViewArticle') ? newsPage('<p>טקסט.</p>') : listPage;
      },
    });
    expect(result.problems).toEqual([]);
    expect(fetched).toEqual([
      `${SITE}/ViewArticle.aspx?aId=1`,
      `${SITE}/ViewContent.aspx?CategoryId=9240`,
    ]);
    expect(result.fixtures.news).toHaveLength(1);
    expect(result.fixtures.documents).toHaveLength(3);
  });

  it('never fetches a refused address, and reports it', async () => {
    const fetched: string[] = [];
    const result = await runImport(
      sources({
        news: [n('https://www.ima.org.il/DoctorsIndex/'), n(`${SITE}/Users.aspx?id=1`)],
      }),
      {
        robots,
        fetchPage: async (url) => {
          fetched.push(url);
          return listPage;
        },
      },
    );
    expect(fetched).toEqual([`${SITE}/ViewContent.aspx?CategoryId=9240`]);
    expect(result.problems.map((p) => p.url)).toEqual([
      'https://www.ima.org.il/DoctorsIndex/',
      `${SITE}/Users.aspx?id=1`,
    ]);
  });

  it('obeys robots.txt before fetching', async () => {
    const result = await runImport(sources({ positionPapers: [] }), {
      robots: parseRobots('User-agent: *\nDisallow: /ViewArticle.aspx'),
      fetchPage: async () => {
        throw new Error('must not be fetched');
      },
    });
    expect(result.problems).toEqual([
      { url: `${SITE}/ViewArticle.aspx?aId=1`, reason: 'refused: robots.txt disallows it' },
    ]);
  });

  it('keeps a page with personal data out of the fixtures', async () => {
    const result = await runImport(sources({ positionPapers: [] }), {
      robots,
      fetchPage: async () => newsPage('<p>לפרטים: someone@example.test</p>'),
    });
    expect(result.fixtures.news).toEqual([]);
    expect(result.problems[0]?.reason).toBe('personal data found: email address');
  });

  it('reports a page listed twice and a page that can’t be read', async () => {
    const result = await runImport(
      sources({
        news: [n(`${SITE}/ViewArticle.aspx?aId=1`), n(`${SITE}/ViewArticle.aspx?aId=1`)],
        positionPapers: [],
      }),
      { robots, fetchPage: async () => '<html></html>' },
    );
    expect(result.problems.map((p) => p.reason)).toEqual(['no title found', 'listed twice']);
  });
});
