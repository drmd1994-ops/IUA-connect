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
 *   3. question-bank: the starter questions, waiting for review (M23)
 *   4. careers:  fictional positions, mentors and mentorship requests (M28)
 *   5. communities: posts and comments, moderators; every chat room archived (M25)
 *   6. research: fictional projects with their groups, requests, publications (M27)
 *   7. journal-club: entries about made-up articles, their discussions and answers (M31)
 *   8. cases: made-up cases, waiting for the owner's review (M26)
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
import { parseEnv } from '../../src/config/env.schema';
import { createPgAdapter } from '../../src/infra/prisma/pg-adapter';
import { seedDemo } from './demo';
import { seedDemoCareers } from './demo-careers';
import { seedDemoCommunities } from './demo-communities';
import { seedDemoResearch } from './demo-research';
import { seedDemoJournalClub } from './demo-journal-club';
import { seedDemoCases } from './demo-cases';
import { seedDemoImaging } from './demo-imaging';
import { seedDemoChat } from './demo-chat';
import { seedDemoContent } from './demo-content';
import { seedDemoEducation } from './demo-education';
import { seedDemoConference } from './demo-conference';
import { seedDemoEvents } from './demo-events';
import { seedDemoGroups } from './demo-groups';
import { seedDemoNotifications } from './demo-notifications';
import { seedStarterQuestions } from './demo-question-bank';
import { seedDemoPortal } from './demo-portal';
import { seedDemoVerification } from './demo-verification';
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
      await seedDemoVerification(prisma);
    },
  },
  // The question bank's starter set, waiting for review (M23). Its own layer, so the hosted demo
  // can add it to a database seeded before M23 (SEED_LAYERS=question-bank).
  { name: 'question-bank', milestone: 'M23', run: seedStarterQuestions },
  // Jobs, fellowships and mentors (M28), for the same reason.
  { name: 'careers', milestone: 'M28', run: seedDemoCareers },
  // Communities and their posts (M25), which also archives every chat room.
  { name: 'communities', milestone: 'M25', run: seedDemoCommunities },
  // Research projects and publications (M27).
  { name: 'research', milestone: 'M27', run: seedDemoResearch },
  // The journal club (M31), after the communities its discussions go into.
  { name: 'journal-club', milestone: 'M31', run: seedDemoJournalClub },
  // Case discussions (M26): made-up cases, waiting for review; nothing shows until approved.
  { name: 'cases', milestone: 'M26', run: seedDemoCases },
  // The demo's made-up conference (M32), its chair and moderator.
  { name: 'conference', milestone: 'M32', run: seedDemoConference },
  // Three public teaching scans (M36) as library items, waiting for the owner's review.
  { name: 'imaging', milestone: 'M36', run: seedDemoImaging },
];

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEMO_HOSTED !== 'true') {
      throw new Error('Seeding is disabled when NODE_ENV=production.');
    }
    // A hosted demo (M18): the same checks as the server's start, so it is seeded only with its
    // own demo password and keys that are not "dev".
    parseEnv(process.env);
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
