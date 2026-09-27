import { Client } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPgAdapter } from '../src/infra/prisma/pg-adapter';
import { testAppUrl } from './test-db';

describe('database baseline', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: testAppUrl() });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it('has the required extensions', async () => {
    const { rows } = await db.query<{ extname: string }>('SELECT extname FROM pg_extension');
    expect(rows.map((r) => r.extname)).toEqual(
      expect.arrayContaining(['citext', 'pg_trgm', 'pgcrypto']),
    );
  });

  describe('normalize_he', () => {
    it.each([
      ['strips niqqud', 'שָׁלוֹם', 'שלומ'],
      ['folds final letters', 'ךםןףץ', 'כמנפצ'],
      ['turns maqaf into a space', 'בית־ספר', 'בית ספר'],
      ['lower-cases Latin text', 'PSA Screening', 'psa screening'],
      ['keeps plain Hebrew without finals', 'אורולוגיה', 'אורולוגיה'],
    ])('%s', async (_label, input, expected) => {
      const { rows } = await db.query<{ out: string }>('SELECT normalize_he($1) AS out', [input]);
      expect(rows[0]!.out).toBe(expected);
    });

    it('returns NULL for NULL', async () => {
      const { rows } = await db.query('SELECT normalize_he(NULL) AS out');
      expect(rows[0].out).toBeNull();
    });
  });

  describe('time zones (regression: timestamps were stored shifted by the server offset)', () => {
    it('uses UTC as the database default', async () => {
      const { rows } = await db.query<{ TimeZone: string }>('SHOW timezone');
      expect(rows[0]!.TimeZone).toBe('UTC');
    });

    it('stores the exact instant written through Prisma', async () => {
      const prisma = new PrismaClient({ adapter: createPgAdapter(testAppUrl()) });
      try {
        const instant = new Date('2026-01-01T12:00:00.000Z'); // winter: Israel is UTC+2
        const rows = await prisma.$queryRaw<{ same: boolean }[]>`
          SELECT ${instant}::timestamptz = '2026-01-01T12:00:00Z'::timestamptz AS same`;
        expect(rows[0]!.same).toBe(true);
      } finally {
        await prisma.$disconnect();
      }
    });
  });

  it('the application role cannot create tables', async () => {
    await expect(db.query('CREATE TABLE should_fail (id int)')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('the application role cannot modify the migrations table', async () => {
    await expect(db.query('DELETE FROM _prisma_migrations')).rejects.toMatchObject({
      code: '42501',
    });
  });
});
