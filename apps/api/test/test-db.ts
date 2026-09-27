import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value === '__GENERATED__') {
    throw new Error(`${name} is not set. Run \`pnpm setup:dev\` (locally) or set it in CI.`);
  }
  return value;
}

/** Test database as the application role (what the API uses at runtime). */
export const testAppUrl = () => required('TEST_DATABASE_URL');
/** Test database as the owner role (what migrations use). */
export const testOwnerUrl = () => required('TEST_MIGRATION_DATABASE_URL');
