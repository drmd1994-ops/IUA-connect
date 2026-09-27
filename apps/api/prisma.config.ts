import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The repository keeps a single .env at the root.
loadEnv({ path: path.resolve(__dirname, '../../.env'), quiet: true });

// Migrations run as the owner role. `prisma generate` needs no connection, so the URL may be
// absent in CI jobs that only lint, typecheck or build.
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed/index.ts',
  },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
