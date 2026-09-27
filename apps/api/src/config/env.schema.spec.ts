import { InvalidEnvironmentError, parseEnv } from './env.schema';

const valid = {
  NODE_ENV: 'development',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://iua_app:secret-value@localhost:5432/iua_connect',
};

function parseError(source: Record<string, string>): InvalidEnvironmentError {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error;
    throw error;
  }
  throw new Error('expected parseEnv to throw');
}

describe('parseEnv', () => {
  it('accepts a valid development environment and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:3000']);
    expect(env.MALWARE_SCANNER).toBe('noop');
  });

  it('splits multiple CORS origins', () => {
    const env = parseEnv({ ...valid, WEB_ORIGIN: 'http://localhost:3000, https://demo.example' });
    expect(env.WEB_ORIGIN).toEqual(['http://localhost:3000', 'https://demo.example']);
  });

  it('refuses to start in production with demo adapters', () => {
    const problems = parseError({ ...valid, NODE_ENV: 'production' }).problems.join('\n');
    expect(problems).toContain('MALWARE_SCANNER');
    expect(problems).toContain('MAILER_ADAPTER');
    expect(problems).toContain('STORAGE_ADAPTER');
    expect(problems).toContain('RATE_LIMIT_STORE');
  });

  it('rejects adapters that are not implemented', () => {
    expect(parseError({ ...valid, MALWARE_SCANNER: 'clamav' }).message).toContain(
      'MALWARE_SCANNER',
    );
  });

  it('never includes secret values in error messages', () => {
    const error = parseError({ ...valid, DATABASE_URL: 'mysql://user:TopSecret123@host/db' });
    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).not.toContain('TopSecret123');
  });
});
