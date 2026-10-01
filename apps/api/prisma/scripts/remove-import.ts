/**
 * `pnpm import:remove`
 *
 * Development only (docs/plans/M4-content-import.md §3.4). Deletes everything the content import
 * created (news and guideline entries whose source is the IUA website) and nothing else, so the
 * sample can be taken out of the demo at once. `pnpm db:seed` loads it again from the fixtures.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';
import { removeImport } from '../seed/import';

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('import:remove is for development only and refuses NODE_ENV=production.');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set. Run `pnpm setup:dev`.');

  const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
  try {
    const removed = await removeImport(prisma);
    console.log(
      `Removed ${removed.news} imported news items and ${removed.guidelines} guideline entries.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
