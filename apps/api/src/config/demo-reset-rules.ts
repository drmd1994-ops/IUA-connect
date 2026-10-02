/**
 * What `pnpm demo:reset` checks before it empties a database (M9 plan §2.2). It only ever
 * touches the development database on this machine: never production, never the test
 * database, never a database on another host.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface ResetTarget {
  database: string;
  migrationUrl: string;
  appUrl: string;
  /** The application's database role, which gets its privileges back after the reset. */
  appRole: string;
}

export type ResetCheck = { ok: true; target: ResetTarget } | { ok: false; problem: string };

export function checkDemoReset(env: Record<string, string | undefined>): ResetCheck {
  const refuse = (problem: string): ResetCheck => ({ ok: false, problem });
  if (env.NODE_ENV === 'production') return refuse('It refuses to run with NODE_ENV=production.');

  const migrationUrl = env.MIGRATION_DATABASE_URL;
  const appUrl = env.DATABASE_URL;
  const expected = env.DB_NAME;
  const appRole = env.DB_APP_USER;
  if (!migrationUrl || !appUrl || !expected || !appRole) {
    return refuse('The database settings are missing in .env. Run `pnpm setup:dev` first.');
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) {
    return refuse('DB_APP_USER must be a plain lower-case name.');
  }

  let urls: URL[];
  try {
    urls = [new URL(migrationUrl), new URL(appUrl)];
  } catch {
    return refuse('The database addresses in .env could not be read.');
  }
  for (const url of urls) {
    if (!/^postgres(ql)?:$/.test(url.protocol)) {
      return refuse('The database addresses in .env must be postgresql:// addresses.');
    }
    if (!LOCAL_HOSTS.has(url.hostname)) {
      return refuse(`It only resets a database on this machine, not on "${url.hostname}".`);
    }
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (database !== expected) {
      return refuse(
        `It only resets the development database "${expected}", and .env points at "${database}".`,
      );
    }
  }
  if (expected === env.DB_TEST_NAME) {
    return refuse('The development database and the test database have the same name.');
  }
  return { ok: true, target: { database: expected, migrationUrl, appUrl, appRole } };
}
