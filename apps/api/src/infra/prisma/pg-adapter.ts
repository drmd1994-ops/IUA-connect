import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma's pg adapter sends DateTime values without a UTC offset, so PostgreSQL reads them in the
 * session time zone. On a server set to Asia/Jerusalem that shifts every stored timestamp by 2–3
 * hours (reads shift back, hiding the bug from the app while SQL `now()` comparisons break).
 * Pinning the session to UTC stores the correct instant. `pnpm db:provision` also sets UTC as the
 * databases' default time zone.
 */
export function createPgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c TimeZone=UTC' });
}
