import { generateDevSecrets } from './dev-secrets';
import { InvalidEnvironmentError, parseEnv } from './env.schema';

const secrets = generateDevSecrets();
const valid: Record<string, string> = {
  NODE_ENV: 'development',
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://iua_app:secret-value@localhost:5432/iua_connect',
  ...secrets,
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

  it('keeps the rate limits unscaled by default, and refuses a scale in production', () => {
    expect(parseEnv(valid).RATE_LIMIT_SCALE).toBe(1);
    expect(parseEnv({ ...valid, RATE_LIMIT_SCALE: '10' }).RATE_LIMIT_SCALE).toBe(10);
    expect(parseError({ ...valid, RATE_LIMIT_SCALE: '0' }).message).toContain('RATE_LIMIT_SCALE');
    const problems = parseError({
      ...valid,
      NODE_ENV: 'production',
      RATE_LIMIT_SCALE: '10',
    }).problems.join('\n');
    expect(problems).toContain('RATE_LIMIT_SCALE');
  });

  it('rejects adapters that are not implemented', () => {
    expect(parseError({ ...valid, MALWARE_SCANNER: 'clamav' }).message).toContain(
      'MALWARE_SCANNER',
    );
  });

  it('decodes the key material', () => {
    const env = parseEnv(valid);
    expect(env.JWT_PRIVATE_KEY).toContain('-----BEGIN PRIVATE KEY-----');
    expect(env.TOKEN_HASH_KEY.length).toBeGreaterThanOrEqual(32);
    expect(env.FIELD_ENCRYPTION_KEYS[env.FIELD_ENCRYPTION_KEY_ID]).toHaveLength(32);
  });

  it('refuses development keys in production', () => {
    const problems = parseError({ ...valid, NODE_ENV: 'production' }).problems.join('\n');
    expect(problems).toContain('JWT_KEY_ID');
    expect(problems).toContain('FIELD_ENCRYPTION_KEY_ID');
  });

  it('rejects a short token-hashing key', () => {
    const problems = parseError({ ...valid, TOKEN_HASH_KEY: Buffer.alloc(16).toString('base64') });
    expect(problems.problems.join('\n')).toContain('TOKEN_HASH_KEY');
  });

  it('rejects an active field key that is not in the key list', () => {
    const problems = parseError({ ...valid, FIELD_ENCRYPTION_KEY_ID: 'missing-key' });
    expect(problems.problems.join('\n')).toContain('FIELD_ENCRYPTION_KEY_ID');
  });

  it('rejects malformed field-encryption keys without echoing them', () => {
    const error = parseError({ ...valid, FIELD_ENCRYPTION_KEYS: 'k1:c2hvcnQ=' });
    expect(error.message).toContain('FIELD_ENCRYPTION_KEYS');
    expect(error.message).not.toContain('c2hvcnQ');
  });

  it('derives the passkey relying party from the web app URL', () => {
    const env = parseEnv({ ...valid, APP_BASE_URL: 'https://connect.example.org' });
    expect(env.WEBAUTHN_RP_ID).toBe('connect.example.org');
    expect(env.WEBAUTHN_ORIGIN).toEqual(['https://connect.example.org']);
    const local = parseEnv(valid);
    expect(local.WEBAUTHN_RP_ID).toBe('localhost');
    expect(local.WEBAUTHN_ORIGIN).toEqual(['http://localhost:3001']);
  });

  it('refuses localhost as the passkey relying party in production', () => {
    const problems = parseError({ ...valid, NODE_ENV: 'production' }).problems.join('\n');
    expect(problems).toContain('WEBAUTHN_RP_ID');
  });

  it('never includes secret values in error messages', () => {
    const error = parseError({ ...valid, DATABASE_URL: 'mysql://user:TopSecret123@host/db' });
    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).not.toContain('TopSecret123');
  });
});
