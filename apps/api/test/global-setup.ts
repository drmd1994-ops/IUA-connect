import { execSync } from 'node:child_process';
import path from 'node:path';
import { testAppUrl, testOwnerUrl } from './test-db';

/**
 * Before any integration test: bring the test database to the latest migration (as the owner
 * role) and apply the reference seed (as the application role, like the running API).
 */
export default function globalSetup(): void {
  const cwd = path.resolve(__dirname, '..');
  execSync('pnpm exec prisma migrate deploy', {
    cwd,
    env: { ...process.env, MIGRATION_DATABASE_URL: testOwnerUrl() },
    stdio: 'inherit',
  });
  execSync('pnpm exec prisma db seed', {
    cwd,
    env: {
      ...process.env,
      MIGRATION_DATABASE_URL: testOwnerUrl(),
      DATABASE_URL: testAppUrl(),
      SEED_LAYERS: 'reference',
    },
    stdio: 'inherit',
  });
}
