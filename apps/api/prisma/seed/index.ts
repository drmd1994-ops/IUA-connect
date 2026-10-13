/**
 * Seed runner (DATABASE_DESIGN.md §6). Layers run in order and must be idempotent:
 *   1. reference: roles, permissions (M1); membership types, subspecialties, hospitals (M2)
 *   2. demo:      fictional people, directors, memberships, applications (M2);
 *                 a content editor, news in every state and sample guidelines (M3);
 *                 an event admin, speakers and events in every state (M5);
 *                 education items, a course and exam questions waiting for review (M6);
 *                 a second admin, directory members, notices and broadcasts (M7);
 *                 a super admin, contact details and a sample notice (M8);
 *                 conversations, a blocked pair and a chat report waiting for review (M11);
 *                 room categories and chat rooms with a moderator, a ban and a report (M12);
 *                 groups, invitations, a room by invitation and files in messages (M13)
 * The sample imported from a real organisation's website (M4) is no longer a layer: nothing of a
 * real organisation is in the demo (M16). `seedImport` and the importer stay in the repository,
 * unused, and `pnpm import:remove` takes an earlier sample out of a database.
 * Connects as the application role (DATABASE_URL). Seeds refuse to run in production.
 * SEED_LAYERS (comma-separated, e.g. "reference") limits which layers run; integration tests seed
 * only the reference layer.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../../src/generated/prisma/client';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';
import { seedDemo } from './demo';
import { seedDemoChat } from './demo-chat';
import { seedDemoContent } from './demo-content';
import { seedDemoEducation } from './demo-education';
import { seedDemoEvents } from './demo-events';
import { seedDemoGroups } from './demo-groups';
import { seedDemoNotifications } from './demo-notifications';
import { seedDemoPortal } from './demo-portal';
import { seedDemoRooms } from './demo-rooms';
import { seedReference } from './reference';

interface SeedLayer {
  name: string;
  milestone: string;
  run?: (prisma: PrismaClient) => Promise<void>;
}

const LAYERS: SeedLayer[] = [
  { name: 'reference', milestone: 'M1', run: seedReference },
  {
    name: 'demo',
    milestone: 'M2',
    run: async (prisma) => {
      await seedDemo(prisma);
      await seedDemoContent(prisma);
      await seedDemoEvents(prisma);
      await seedDemoEducation(prisma);
      await seedDemoNotifications(prisma);
      await seedDemoPortal(prisma);
      await seedDemoChat(prisma);
      await seedDemoRooms(prisma);
      await seedDemoGroups(prisma);
    },
  },
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
