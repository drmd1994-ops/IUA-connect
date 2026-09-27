import { generateDevSecrets } from '../config/dev-secrets';
import { type Env, parseEnv } from '../config/env.schema';

const secrets = generateDevSecrets();

/** Environment for tests. The database URL is only connected to by integration tests. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://unused@localhost:5432/unused',
    ...secrets,
    ...overrides,
  });
}
