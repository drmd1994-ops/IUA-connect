import { type Env, parseEnv } from '../config/env.schema';

/** Environment for unit tests. The database URL is never connected to (Prisma connects lazily). */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://unused@localhost:5432/unused',
    ...overrides,
  });
}
