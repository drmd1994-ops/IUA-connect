import { checkDemoReset } from './demo-reset-rules';

const env = {
  NODE_ENV: 'development',
  DB_NAME: 'iua_connect',
  DB_TEST_NAME: 'iua_connect_test',
  DB_APP_USER: 'iua_app',
  MIGRATION_DATABASE_URL: 'postgresql://iua_owner:x@localhost:5432/iua_connect',
  DATABASE_URL: 'postgresql://iua_app:y@localhost:5432/iua_connect?schema=public',
};
const problem = (overrides: Record<string, string | undefined>) => {
  const result = checkDemoReset({ ...env, ...overrides });
  return result.ok ? null : result.problem;
};

describe('demo reset safety check', () => {
  it('accepts the development database on this machine', () => {
    expect(checkDemoReset(env)).toEqual({
      ok: true,
      target: {
        database: 'iua_connect',
        migrationUrl: env.MIGRATION_DATABASE_URL,
        appUrl: env.DATABASE_URL,
        appRole: 'iua_app',
      },
    });
    expect(problem({ MIGRATION_DATABASE_URL: 'postgres://o:x@127.0.0.1/iua_connect' })).toBeNull();
  });

  it('refuses production', () => {
    expect(problem({ NODE_ENV: 'production' })).toContain('production');
  });

  it('refuses the test database and any other database', () => {
    expect(
      problem({ MIGRATION_DATABASE_URL: 'postgresql://o:x@localhost:5432/iua_connect_test' }),
    ).toContain('iua_connect_test');
    expect(problem({ DATABASE_URL: 'postgresql://a:y@localhost:5432/postgres' })).toContain(
      'postgres',
    );
    expect(problem({ DB_TEST_NAME: 'iua_connect' })).toContain('same name');
  });

  it('refuses a database on another machine', () => {
    expect(
      problem({ MIGRATION_DATABASE_URL: 'postgresql://o:x@db.example.test:5432/iua_connect' }),
    ).toContain('db.example.test');
    expect(problem({ DATABASE_URL: 'postgresql://a:y@10.0.0.5:5432/iua_connect' })).toContain(
      '10.0.0.5',
    );
  });

  it('refuses when the settings are missing or unreadable', () => {
    expect(problem({ MIGRATION_DATABASE_URL: undefined })).toContain('setup:dev');
    expect(problem({ DB_NAME: undefined })).toContain('setup:dev');
    expect(problem({ DATABASE_URL: 'not an address' })).toContain('could not be read');
    expect(problem({ DATABASE_URL: 'mysql://a:y@localhost/iua_connect' })).toContain(
      'postgresql://',
    );
    expect(problem({ DB_APP_USER: 'app"; DROP' })).toContain('DB_APP_USER');
  });
});
