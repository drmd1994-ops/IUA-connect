import { PERMISSIONS, ROLES, ROLE_KEYS, uuidv7 } from '@medconnect/shared';
import { Client } from 'pg';
import { testAppUrl } from './test-db';

describe('identity schema and reference seed', () => {
  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString: testAppUrl() });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  async function createUser(email = `user-${uuidv7()}@example.test`): Promise<string> {
    const id = uuidv7();
    await db.query(
      `INSERT INTO users (id, email, password_hash, updated_at) VALUES ($1, $2, 'x', now())`,
      [id, email],
    );
    return id;
  }

  async function roleId(key: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM roles WHERE key = $1', [key]);
    return rows[0]!.id;
  }

  it('seeds every permission and role from the shared catalogue', async () => {
    const { rows } = await db.query<{ key: string; permissions: string[] }>(`
      SELECT r.key, coalesce(array_agg(p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.key`);
    expect(rows.map((r) => r.key).sort()).toEqual([...ROLE_KEYS].sort());
    for (const row of rows) {
      const expected = [...ROLES[row.key as keyof typeof ROLES].permissions].sort();
      expect(row.permissions.sort()).toEqual(expected);
    }
    const { rows: permissions } = await db.query<{ key: string }>('SELECT key FROM permissions');
    expect(permissions.map((p) => p.key).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('treats emails case-insensitively and stores them lower-case', async () => {
    const email = `Case-${uuidv7()}@Example.test`;
    await expect(createUser(email)).rejects.toMatchObject({ code: '23514' }); // lower-case check
    await createUser(email.toLowerCase());
    // citext: the same address in another case is a duplicate.
    const { rows } = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    expect(rows).toHaveLength(1);
  });

  it('grants an unscoped role to a user only once (NULLS NOT DISTINCT)', async () => {
    const userId = await createUser();
    const grant = () =>
      db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type) VALUES ($1, $2, $3, 'NONE')`,
        [uuidv7(), userId, roleIdCache],
      );
    const roleIdCache = await roleId('PLATFORM_ADMIN');
    await grant();
    await expect(grant()).rejects.toMatchObject({ code: '23505' });
  });

  it('requires a scope ID exactly when the scope type is not NONE', async () => {
    const userId = await createUser();
    const director = await roleId('DEPARTMENT_DIRECTOR');
    await expect(
      db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type) VALUES ($1, $2, $3, 'DEPARTMENT')`,
        [uuidv7(), userId, director],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id) VALUES ($1, $2, $3, 'NONE', $4)`,
        [uuidv7(), userId, director, uuidv7()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    // The scope must also name an existing department (M2 trigger).
    await expect(
      db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id) VALUES ($1, $2, $3, 'DEPARTMENT', $4)`,
        [uuidv7(), userId, director, uuidv7()],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const { rows } = await db.query<{ id: string }>('SELECT id FROM departments LIMIT 1');
    await db.query(
      `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id) VALUES ($1, $2, $3, 'DEPARTMENT', $4)`,
      [uuidv7(), userId, director, rows[0]!.id],
    );
  });

  it('removes a user’s sessions, tokens and roles when the user is deleted', async () => {
    const userId = await createUser();
    const sessionId = uuidv7();
    await db.query(
      `INSERT INTO sessions (id, user_id, idle_timeout_sec, expires_at) VALUES ($1, $2, 900, now() + interval '1 hour')`,
      [sessionId, userId],
    );
    await db.query(
      `INSERT INTO user_roles (id, user_id, role_id, scope_type) VALUES ($1, $2, $3, 'NONE')`,
      [uuidv7(), userId, await roleId('EVENT_ADMIN')],
    );
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    const { rows } = await db.query(
      `SELECT (SELECT count(*) FROM sessions WHERE id = $1) + (SELECT count(*) FROM user_roles WHERE user_id = $2) AS n`,
      [sessionId, userId],
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
