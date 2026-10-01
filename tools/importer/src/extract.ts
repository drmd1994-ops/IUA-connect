import * as cheerio from 'cheerio';

/** How much of an article's own text is kept (M4 plan §11: a short excerpt, not the full text). */
export const EXCERPT_LENGTH = 300;

export interface NewsFixture {
  sourceUrl: string;
  title: string;
  /** The date shown on the page, as YYYY-MM-DD. */
  date: string;
  /** The first sentences of the page's own text; null when the page only links to a document. */
  excerpt: string | null;
}

export interface DocumentFixture {
  /** The list page the entry was read from. */
  sourceUrl: string;
  kind: 'guidelines' | 'position-papers';
  title: string;
  /** The year printed in the title, when there is one. */
  year: number | null;
  /** The publisher's own link to the document. The document itself is never fetched. */
  documentUrl: string;
}

export interface ConferenceFixture {
  sourceUrl: string;
  title: string;
  excerpt: string | null;
}

export class ExtractionError extends Error {}

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "31.01.2026" (as the site prints dates) → "2026-01-31". */
export function parseSiteDate(text: string): string | null {
  const match = /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/.exec(text);
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}

/** At most `EXCERPT_LENGTH` characters, cut at a word boundary, with an ellipsis when cut. */
export function excerptOf(text: string): string | null {
  const clean = tidy(text);
  if (!clean) return null;
  if (clean.length <= EXCERPT_LENGTH) return clean;
  const cut = clean.slice(0, EXCERPT_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > EXCERPT_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const DROP = 'script, style, form, img, noscript, iframe';
const BLOCKS = 'p, div, br, li, tr, h1, h2, h3, h4, h5, h6';

/** Readable text of the first match: no scripts, forms or images, and a space between blocks. */
function textOf($: cheerio.CheerioAPI, selector: string, alsoDrop?: string): string {
  const element = $(selector).first().clone();
  element.find(alsoDrop ? `${DROP}, ${alsoDrop}` : DROP).remove();
  element.find(BLOCKS).after(' ');
  return tidy(element.text());
}

export function extractNews(html: string, sourceUrl: string): NewsFixture {
  const $ = cheerio.load(html);
  const title = textOf($, '.web-title') || textOf($, 'main h1');
  if (!title) throw new ExtractionError('no title found');
  const date = parseSiteDate(textOf($, '#ctl00_MainContent_spnDate'));
  if (!date) throw new ExtractionError('no date found');
  const text = textOf($, '.view-article-summery') || articleBody($);
  return { sourceUrl, title, date, excerpt: excerptOf(text) };
}

/** The article's own text: everything in the article except the date line and the file link. */
function articleBody($: cheerio.CheerioAPI): string {
  return textOf(
    $,
    'article.view-article-container',
    '.intro_article, #ctl00_MainContent_dvWrapFile',
  );
}

/** Entries of a document list page (clinical guidelines, position papers). */
export function extractDocuments(
  html: string,
  sourceUrl: string,
  kind: DocumentFixture['kind'],
): DocumentFixture[] {
  const $ = cheerio.load(html);
  const entries: DocumentFixture[] = [];
  $('#ctl00_MainContent_dvCategories a.categoriesPages__title').each((_, element) => {
    const title = tidy($(element).text());
    const href = $(element).attr('href');
    if (!title || !href) return;
    let documentUrl: URL;
    try {
      documentUrl = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (documentUrl.protocol !== 'https:' && documentUrl.protocol !== 'http:') return;
    const year = /(?<!\d)((?:19|20)\d{2})(?!\d)\s*$/.exec(title);
    entries.push({
      sourceUrl,
      kind,
      title,
      year: year ? Number(year[1]) : null,
      documentUrl: documentUrl.toString(),
    });
  });
  if (entries.length === 0) throw new ExtractionError('no documents found');
  return entries;
}

export function extractConference(html: string, sourceUrl: string): ConferenceFixture {
  const $ = cheerio.load(html);
  const title = textOf($, '.web-title') || textOf($, 'main h1');
  if (!title) throw new ExtractionError('no title found');
  return { sourceUrl, title, excerpt: excerptOf(textOf($, '#ctl00_MainContent_dvContent')) };
}
