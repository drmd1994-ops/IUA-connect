import { readFileSync } from 'node:fs';
import path from 'node:path';
import { uuidv7 } from '@iua/shared';
import { type PrismaClient } from '../../src/generated/prisma/client';
import { slugify, uniqueSlug } from '../../src/modules/news/slug';

/**
 * Import layer (DATABASE_DESIGN.md §6, layer 3; docs/plans/M4-content-import.md): the hand-picked
 * sample of the IUA website, loaded from the committed fixtures. No network is used here; the
 * fixtures are written by `pnpm import:fetch` and reviewed in a pull request first.
 *
 * - News: the reviewed title, the original date and a link to the source. No text is copied.
 * - Documents (clinical guidelines and position papers): details and the publisher's own link.
 *   The documents themselves are never fetched or stored (spec §14).
 * - Conference pages wait in their fixture for the events module (M5).
 *
 * Idempotent: every item is matched by its source address, so a second run creates nothing.
 * `removeImport` takes the whole sample out again.
 */
export const SOURCE_SITE = 'https://urology.ima.org.il/';
const CATEGORY_KEY = 'iua_website';
const SOURCE_ORG = 'האיגוד הישראלי לאורולוגיה';
const FIXTURES = path.resolve(__dirname, '../fixtures/iua-import');

export interface NewsFixture {
  sourceUrl: string;
  title: string;
  /** YYYY-MM-DD, as shown on the source page. */
  date: string;
  excerpt: string | null;
}

export interface DocumentFixture {
  sourceUrl: string;
  kind: 'guidelines' | 'position-papers';
  title: string;
  year: number | null;
  documentUrl: string;
}

export interface ImportFixtures {
  news: NewsFixture[];
  documents: DocumentFixture[];
}

export interface ImportCounts {
  news: number;
  guidelines: number;
}

export function loadFixtures(): ImportFixtures {
  const read = <T>(name: string) =>
    JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
  return { news: read('news.json'), documents: read('documents.json') };
}

/** Every imported address must belong to the source site (a last check before the database). */
function fromSourceSite(url: string): boolean {
  return url.startsWith(SOURCE_SITE);
}

/** Loads the fixtures. Returns how many items were created (0 and 0 on a repeated run). */
export async function seedImport(
  prisma: PrismaClient,
  fixtures: ImportFixtures = loadFixtures(),
): Promise<ImportCounts> {
  const created: ImportCounts = { news: 0, guidelines: 0 };
  for (const item of [...fixtures.news, ...fixtures.documents]) {
    if (!fromSourceSite(item.sourceUrl)) {
      throw new Error(`Import fixture from another site: ${item.sourceUrl}`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      if (fixtures.news.length > 0) {
        const category = await tx.newsCategory.upsert({
          where: { key: CATEGORY_KEY },
          update: {},
          create: {
            id: uuidv7(),
            key: CATEGORY_KEY,
            nameHe: 'מאתר האיגוד',
            nameEn: 'From the IUA website',
            sortOrder: 90,
          },
        });
        for (const item of fixtures.news) {
          if (await tx.news.findUnique({ where: { sourceUrl: item.sourceUrl } })) continue;
          const id = uuidv7();
          // Noon UTC keeps the same calendar day in Israel.
          const date = new Date(`${item.date}T12:00:00.000Z`);
          const slug = await uniqueSlug(
            slugify(item.title),
            async (candidate) =>
              (await tx.news.findUnique({ where: { slug: candidate } })) !== null,
          );
          await tx.news.create({
            data: {
              id,
              slug,
              status: 'PUBLISHED',
              categoryId: category.id,
              accessTier: 'PUBLIC',
              publishedAt: date,
              sourceUrl: item.sourceUrl,
              sourcePublishedAt: date,
              translations: {
                create: [{ locale: 'he', title: item.title, summary: item.excerpt, body: '' }],
              },
              history: {
                create: [
                  { id: uuidv7(), action: 'import', fromStatus: null, toStatus: 'PUBLISHED' },
                ],
              },
            },
          });
          created.news++;
        }
      }

      for (const item of fixtures.documents) {
        // Every entry needs a date, and none is invented: a document without a year is not loaded.
        if (item.year === null) throw new Error(`Import document without a year: ${item.title}`);
        const existing = await tx.guideline.findUnique({
          where: {
            sourceUrl_officialUrl: { sourceUrl: item.sourceUrl, officialUrl: item.documentUrl },
          },
        });
        if (existing) continue;
        await tx.guideline.create({
          data: {
            id: uuidv7(),
            sourceOrg: SOURCE_ORG,
            officialUrl: item.documentUrl,
            status: 'CURRENT',
            accessTier: 'PUBLIC',
            sourceUrl: item.sourceUrl,
            translations: { create: [{ locale: 'he', title: item.title }] },
            // The source states only a year, so the entry is marked "year only" (plan §11.7).
            versions: {
              create: [
                {
                  id: uuidv7(),
                  version: String(item.year),
                  publishedOn: new Date(Date.UTC(item.year, 0, 1)),
                  yearOnly: true,
                },
              ],
            },
          },
        });
        created.guidelines++;
      }
    },
    { timeout: 60_000 },
  );
  return created;
}

/** Deletes everything the import created (matched by source address) and nothing else. */
export async function removeImport(prisma: PrismaClient): Promise<ImportCounts> {
  return prisma.$transaction(async (tx) => {
    const news = await tx.news.deleteMany({ where: { sourceUrl: { startsWith: SOURCE_SITE } } });
    const guidelines = await tx.guideline.deleteMany({
      where: { sourceUrl: { startsWith: SOURCE_SITE } },
    });
    // The category goes too, unless an editor has since used it for other items.
    const category = await tx.newsCategory.findUnique({
      where: { key: CATEGORY_KEY },
      select: { id: true, _count: { select: { news: true } } },
    });
    if (category && category._count.news === 0) {
      await tx.newsCategory.delete({ where: { id: category.id } });
    }
    return { news: news.count, guidelines: guidelines.count };
  });
}
