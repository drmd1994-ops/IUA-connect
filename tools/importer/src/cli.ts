/**
 * `pnpm import:fetch`
 *
 * Development only (docs/plans/M4-content-import.md). Reads the hand-picked pages listed in
 * `tools/importer/sources.json` from the IUA website, once each, and writes JSON fixtures to
 * `apps/api/prisma/fixtures/iua-import/`. It never follows links and never lists the site. If any
 * page is refused or fails a check, nothing is written.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseRobots } from './robots';
import { type SourceList, runImport } from './run';
import { SOURCE_HOST } from './sources';

const ROOT = path.resolve(__dirname, '../../..');
const SOURCES = path.resolve(__dirname, '../sources.json');
const OUTPUT = path.join(ROOT, 'apps/api/prisma/fixtures/iua-import');
const USER_AGENT = 'IUA-Connect-importer/0.1 (private demo; one-off hand-picked sample)';
const PAUSE_MS = 3000;
const TIMEOUT_MS = 30_000;

async function get(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    // Never followed: a redirect could lead outside the allowed pages. The site redirects
    // members-only pages to its sign-in page, and those are not imported.
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('the page redirects (members-only pages are not imported)');
  }
  if (!response.ok) throw new Error(`the site answered ${response.status}`);
  return response.text();
}

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The importer is a development tool and refuses NODE_ENV=production.');
  }
  const sources = JSON.parse(await readFile(SOURCES, 'utf8')) as SourceList;
  const robots = parseRobots(await get(`https://${SOURCE_HOST}/robots.txt`));

  const { fixtures, problems } = await runImport(sources, {
    robots,
    fetchPage: async (url) => {
      await pause();
      console.log(`reading ${url}`);
      return get(url);
    },
  });

  if (problems.length > 0) {
    console.error('\nNothing was written. Problems:');
    for (const problem of problems) console.error(`  ${problem.url}: ${problem.reason}`);
    process.exit(1);
  }
  await mkdir(OUTPUT, { recursive: true });
  const write = (name: string, data: unknown) =>
    writeFile(path.join(OUTPUT, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await write('news.json', fixtures.news);
  await write('documents.json', fixtures.documents);
  await write('conferences.json', fixtures.conferences);
  console.log(
    `\nWrote ${fixtures.news.length} news items, ${fixtures.documents.length} documents and ` +
      `${fixtures.conferences.length} conference pages to ${path.relative(ROOT, OUTPUT)}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
