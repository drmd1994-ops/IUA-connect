import { execSync } from 'node:child_process';
import path from 'node:path';
import { testOwnerUrl } from './test-db';

/** Brings the test database up to the latest migration before any integration test runs. */
export default function globalSetup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MIGRATION_DATABASE_URL: testOwnerUrl() },
    stdio: 'inherit',
  });
}
