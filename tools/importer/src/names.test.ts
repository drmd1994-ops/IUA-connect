import { describe, expect, it } from 'vitest';
import { namesAPerson } from './personal-data';
import { parseRobots } from './robots';
import { runImport } from './run';

/** Imported news names nobody (M4 plan §11.5). All names below are made up. */
const SITE = 'https://urology.ima.org.il';
const robots = parseRobots('User-agent: *\nAllow: /');

const newsPage = (title: string, body: string) => `
  <h1 class="web-title">${title}</h1>
  <article class="view-article-container">
    <div class="intro_article"><span id="ctl00_MainContent_spnDate">31.01.2026 | </span></div>
    ${body}
  </article>`;

const listPage = (href: string) => `
  <div id="ctl00_MainContent_dvCategories">
    <a class="categoriesPages__title" href="${href}">הנחיה לדוגמה, 1999</a>
  </div>`;

describe('naming a person', () => {
  it.each([
    'פינת ד"ר ישראלי - מידע לציבור',
    'מידע לציבור- ד״ר פלוני אלמוני',
    'דר פלוני: ספריית ניתוחים',
    "פרופ' פלונית על הנחיות חדשות",
    'הרצאת פרופסור אלמוני',
    'A talk by Dr. Example',
    'Prof Example (guest)',
  ])('recognises "%s"', (text) => {
    expect(namesAPerson(text)).toBe(true);
  });

  it.each([
    'דף מידע לציבור: הרטבת לילה',
    'טיפול באבני מערכת דרכי השתן',
    'הדרכה למתמחים',
    'Drainage after surgery',
    'Professional development',
    '',
  ])('passes "%s"', (text) => {
    expect(namesAPerson(text)).toBe(false);
  });
});

describe('news in a run', () => {
  const url = `${SITE}/ViewArticle.aspx?aId=1`;
  const base = { guidelines: [], positionPapers: [], conferences: [] };

  it('uses the reviewed title, not the page’s, and keeps the page’s date', async () => {
    const result = await runImport(
      { ...base, news: [{ url, title: 'דף מידע לציבור: נושא לדוגמה', keepExcerpt: true }] },
      { robots, fetchPage: async () => newsPage('פינת ד"ר פלוני - נושא לדוגמה', '<p>טקסט.</p>') },
    );
    expect(result.problems).toEqual([]);
    expect(result.fixtures.news).toEqual([
      {
        sourceUrl: url,
        title: 'דף מידע לציבור: נושא לדוגמה',
        date: '2026-01-31',
        excerpt: 'טקסט.',
      },
    ]);
  });

  it('keeps no excerpt unless the reviewer asked for it', async () => {
    const result = await runImport(
      { ...base, news: [{ url, title: 'נושא לדוגמה' }] },
      { robots, fetchPage: async () => newsPage('x', '<p>סיכום מאת פלוני אלמוני.</p>') },
    );
    expect(result.fixtures.news[0]?.excerpt).toBeNull();
  });

  it('keeps no excerpt that names a person', async () => {
    const result = await runImport(
      { ...base, news: [{ url, title: 'נושא לדוגמה', keepExcerpt: true }] },
      { robots, fetchPage: async () => newsPage('x', '<p>מאת ד"ר פלוני אלמוני.</p>') },
    );
    expect(result.fixtures.news[0]?.excerpt).toBeNull();
  });

  it.each([
    ['a title that names a person', 'פינת ד"ר פלוני'],
    ['an empty title', '  '],
  ])('refuses %s without fetching the page', async (_name, title) => {
    const result = await runImport(
      { ...base, news: [{ url, title }] },
      {
        robots,
        fetchPage: async () => {
          throw new Error('must not be fetched');
        },
      },
    );
    expect(result.fixtures.news).toEqual([]);
    expect(result.problems).toEqual([{ url, reason: 'needs a reviewed title that names nobody' }]);
  });
});

describe('document link fixes', () => {
  it('replaces a link that is wrong on the site with the listed working one', async () => {
    const list = `${SITE}/ViewContent.aspx?CategoryId=9249`;
    const result = await runImport(
      {
        news: [],
        guidelines: [list],
        positionPapers: [],
        conferences: [],
        documentLinkFixes: {
          [`${SITE}/broken/file.pdf`]: 'https://docs.example.test/file.pdf',
        },
      },
      { robots, fetchPage: async () => listPage('broken/file.pdf') },
    );
    expect(result.fixtures.documents[0]?.documentUrl).toBe('https://docs.example.test/file.pdf');
  });
});
