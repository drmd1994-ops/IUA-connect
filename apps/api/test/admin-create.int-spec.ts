import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { CookieJar, type Harness, startHarness, uniqueEmail } from './auth-harness';
import { testAppUrl } from './test-db';

const API_DIR = path.resolve(__dirname, '..');

/** Runs `pnpm admin:create` against the test database. */
function createAdmin(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    [require.resolve('tsx/cli'), 'prisma/scripts/create-admin.ts', ...args],
    {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: testAppUrl(), NODE_ENV: 'development', ...env },
      encoding: 'utf8',
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('pnpm admin:create (development only)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('creates a verified super admin who must enrol in MFA at first sign-in', async () => {
    const email = uniqueEmail('admin');
    const run = createAdmin(['--email', email]);
    expect(run.status).toBe(0);
    const password = /Password \(shown once, store it safely\): (\S+)/.exec(run.output)?.[1];
    expect(password).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const jar = new CookieJar();
    const login = await h.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
    jar.store(login);
    const me = await h
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      emailVerified: true,
      locale: 'he',
      roles: ['SUPER_ADMIN'],
      permissions: [], // nothing until MFA
      mfaEnrollmentRequired: true,
    });

    const audit = await h.db.query(
      `SELECT count(*)::int AS n FROM audit_logs a JOIN users u ON a.entity_id = u.id::text
       WHERE u.email = $1 AND a.action = 'admin.cli.create_admin'`,
      [email],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it('is idempotent: a second run keeps the password and grants the role once', async () => {
    const email = uniqueEmail('admin-again');
    expect(createAdmin(['--email', email]).status).toBe(0);
    const again = createAdmin(['--email', email]);
    expect(again.status).toBe(0);
    expect(again.output).toContain('password unchanged');
    const { rows } = await h.db.query(
      `SELECT count(*)::int AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.email = $1`,
      [email],
    );
    expect(rows[0].n).toBe(1);
  });

  it.each([
    [['--email', 'real.person@gmail.com'], 'fictional people only'],
    [['--email', 'x@example.test', '--role', 'DEPARTMENT_DIRECTOR'], 'scoped'],
    [['--email', 'x@example.test', '--role', 'OWNER'], 'Unknown role'],
    [[], 'Give an email address'],
  ])('refuses %j', (args, message) => {
    const run = createAdmin(args);
    expect(run.status).toBe(1);
    expect(run.output).toContain(message);
  });

  it('refuses to run in production', () => {
    const run = createAdmin(['--email', uniqueEmail('prod')], { NODE_ENV: 'production' });
    expect(run.status).toBe(1);
    expect(run.output).toContain('development only');
  });
});
