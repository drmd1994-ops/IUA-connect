/**
 * Seed runner (DATABASE_DESIGN.md §6). Layers run in order and must be idempotent:
 *   1. reference: roles, permissions (M1); membership types, subspecialties, hospitals (M2)
 *   2. demo:      fictional people, directors, memberships, applications (M2)
 *   3. import:    curated IUA website sample from fixtures/iua-import/    (added in M4)
 * Connects as the application role (DATABASE_URL). Seeds refuse to run in production.
 * SEED_LAYERS (comma-separated, e.g. "reference") limits which layers run; integration tests seed
 * only the reference layer.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';
import { seedDemo } from './demo';
import { seedReference } from './reference';

interface SeedLayer {
  name: string;
  milestone: string;
  run?: (prisma: PrismaClient) => Promise<void>;
}

const LAYERS: SeedLayer[] = [
  { name: 'reference', milestone: 'M1', run: seedReference },
  { name: 'demo', milestone: 'M2', run: seedDemo },
  { name: 'import', milestone: 'M4' },
];

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled when NODE_ENV=production.');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set. Run `pnpm setup:dev`.');

  const prisma = new PrismaClient({ adapter: createPgAdapter(connectionString) });
  try {
    const only = process.env.SEED_LAYERS?.split(',').map((name) => name.trim());
    for (const layer of LAYERS) {
      if (only && !only.includes(layer.name)) continue;
      if (!layer.run) {
        console.log(`seed: ${layer.name} layer has no data yet (arrives in ${layer.milestone})`);
        continue;
      }
      await layer.run(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
