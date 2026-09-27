/**
 * Seed runner (DATABASE_DESIGN.md §6). Layers run in order and must be idempotent:
 *   1. reference: roles, permissions, membership types, subspecialties   (added in M1/M2)
 *   2. demo:      fictional people, hospitals, departments, memberships   (added in M2)
 *   3. import:    curated IUA website sample from fixtures/iua-import/    (added in M4)
 * No layer has content yet in M0; the runner reports that instead of pretending to seed.
 * Seeds refuse to run in production.
 */
interface SeedLayer {
  name: string;
  milestone: string;
  run?: () => Promise<void>;
}

const LAYERS: SeedLayer[] = [
  { name: 'reference', milestone: 'M1' },
  { name: 'demo', milestone: 'M2' },
  { name: 'import', milestone: 'M4' },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seeding is disabled when NODE_ENV=production.');
  }
  for (const layer of LAYERS) {
    if (!layer.run) {
      console.log(`seed: ${layer.name} layer has no data yet (arrives in ${layer.milestone})`);
      continue;
    }
    console.log(`seed: ${layer.name} layer...`);
    await layer.run();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
