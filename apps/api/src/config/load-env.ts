import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { type Env, parseEnv } from './env.schema';

/** Loads the repository-root .env (if present) and validates the result. */
export function loadEnv(): Env {
  loadDotenv({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });
  return parseEnv(process.env);
}
