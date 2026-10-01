import {
  type ConferenceFixture,
  type DocumentFixture,
  type NewsFixture,
  extractConference,
  extractDocuments,
  extractNews,
} from './extract';
import { findPersonalData, namesAPerson } from './personal-data';
import { type RobotsRules } from './robots';
import { type SourceKind, checkSource } from './sources';

/** The hand-picked pages (`sources.json`), approved by the owner before anything is fetched. */
/** A news page with its reviewed title: the topic only, with no person named (plan §11.5). */
export interface NewsSource {
  url: string;
  title: string;
  /**
   * Keep the start of the page's own text. Off unless the reviewer read that text and found no
   * names in it: a program can spot "Dr." but not a bare name, such as a summary's author.
   */
  keepExcerpt?: boolean;
}

export interface SourceList {
  news: NewsSource[];
  guidelines: string[];
  positionPapers: string[];
  conferences: string[];
  /** Document links that are wrong on the site, mapped to the working address of the same file. */
  documentLinkFixes?: Record<string, string>;
}

export interface Fixtures {
  news: NewsFixture[];
  documents: DocumentFixture[];
  conferences: ConferenceFixture[];
}

export interface Problem {
  url: string;
  reason: string;
}

export interface ImportResult {
  fixtures: Fixtures;
  /** Pages that were refused or could not be read. Any problem means no fixtures are written. */
  problems: Problem[];
}

interface Page {
  url: string;
  title: string | null;
  keepExcerpt?: boolean;
}

export interface RunOptions {
  /** Fetches one page's HTML. The command-line tool waits between calls. */
  fetchPage: (url: string) => Promise<string>;
  robots: RobotsRules;
}

/**
 * Reads every listed page once and builds the fixtures. Each address must pass the allow-list
 * and robots.txt before it is fetched, and each result must pass the personal-data check.
 */
export async function runImport(sources: SourceList, options: RunOptions): Promise<ImportResult> {
  const fixtures: Fixtures = { news: [], documents: [], conferences: [] };
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const page = (url: string): Page => ({ url, title: null, keepExcerpt: true });
  const groups: [SourceKind, Page[]][] = [
    ['news', sources.news],
    ['guidelines', sources.guidelines.map(page)],
    ['position-papers', sources.positionPapers.map(page)],
    ['conference', sources.conferences.map(page)],
  ];
  const fixes = sources.documentLinkFixes ?? {};

  for (const [kind, pages] of groups) {
    for (const { url: address, title: reviewedTitle, keepExcerpt } of pages) {
      if (kind === 'news' && (!reviewedTitle?.trim() || namesAPerson(reviewedTitle))) {
        problems.push({ url: address, reason: 'needs a reviewed title that names nobody' });
        continue;
      }
      const checked = checkSource(address, kind);
      if (!checked.ok) {
        problems.push({ url: address, reason: `refused: ${checked.reason}` });
        continue;
      }
      const url = new URL(checked.url);
      if (seen.has(checked.url)) {
        problems.push({ url: address, reason: 'listed twice' });
        continue;
      }
      seen.add(checked.url);
      if (!options.robots.allows(url.pathname + url.search)) {
        problems.push({ url: address, reason: 'refused: robots.txt disallows it' });
        continue;
      }
      try {
        const html = await options.fetchPage(checked.url);
        if (kind === 'news') {
          // The page gives the date and the excerpt; the title is the reviewed one.
          const read = extractNews(html, checked.url);
          const item = {
            ...read,
            title: reviewedTitle!.trim(),
            excerpt: keepExcerpt ? unnamed(read.excerpt) : null,
          };
          if (clean(checked.url, [item.title, item.excerpt], problems)) fixtures.news.push(item);
        } else if (kind === 'conference') {
          const read = extractConference(html, checked.url);
          const item = { ...read, excerpt: unnamed(read.excerpt) };
          if (namesAPerson(item.title)) {
            problems.push({ url: address, reason: 'the title names a person' });
          } else if (clean(checked.url, [item.title, item.excerpt], problems)) {
            fixtures.conferences.push(item);
          }
        } else {
          const items = extractDocuments(html, checked.url, kind).map((item) => ({
            ...item,
            documentUrl: fixes[item.documentUrl] ?? item.documentUrl,
          }));
          const titles = items.map((item) => item.title);
          if (clean(checked.url, titles, problems)) fixtures.documents.push(...items);
        }
      } catch (error) {
        problems.push({
          url: address,
          reason: error instanceof Error ? error.message : 'could not be read',
        });
      }
    }
  }
  return { fixtures, problems };
}

/** An excerpt is kept only when it names nobody (M4 plan §11.5). */
const unnamed = (excerpt: string | null) => (namesAPerson(excerpt) ? null : excerpt);

/** True when the texts are free of personal data; otherwise records the problem. */
function clean(url: string, texts: (string | null)[], problems: Problem[]): boolean {
  const found = findPersonalData(texts);
  if (found.length === 0) return true;
  problems.push({ url, reason: `personal data found: ${found.join(', ')}` });
  return false;
}
