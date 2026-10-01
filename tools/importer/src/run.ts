import {
  type ConferenceFixture,
  type DocumentFixture,
  type NewsFixture,
  extractConference,
  extractDocuments,
  extractNews,
} from './extract';
import { findPersonalData } from './personal-data';
import { type RobotsRules } from './robots';
import { type SourceKind, checkSource } from './sources';

/** The hand-picked pages (`sources.json`), approved by the owner before anything is fetched. */
export interface SourceList {
  news: string[];
  guidelines: string[];
  positionPapers: string[];
  conferences: string[];
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
  const groups: [SourceKind, string[]][] = [
    ['news', sources.news],
    ['guidelines', sources.guidelines],
    ['position-papers', sources.positionPapers],
    ['conference', sources.conferences],
  ];

  for (const [kind, addresses] of groups) {
    for (const address of addresses) {
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
          const item = extractNews(html, checked.url);
          if (clean(checked.url, [item.title, item.excerpt], problems)) fixtures.news.push(item);
        } else if (kind === 'conference') {
          const item = extractConference(html, checked.url);
          if (clean(checked.url, [item.title, item.excerpt], problems)) {
            fixtures.conferences.push(item);
          }
        } else {
          const items = extractDocuments(html, checked.url, kind);
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

/** True when the texts are free of personal data; otherwise records the problem. */
function clean(url: string, texts: (string | null)[], problems: Problem[]): boolean {
  const found = findPersonalData(texts);
  if (found.length === 0) return true;
  problems.push({ url, reason: `personal data found: ${found.join(', ')}` });
  return false;
}
