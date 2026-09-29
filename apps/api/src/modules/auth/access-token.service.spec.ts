import { SignJWT, importPKCS8 } from 'jose';
import { generateDevSecrets } from '../../config/dev-secrets';
import { testEnv } from '../../testing/test-env';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const env = testEnv();
  const service = new AccessTokenService(env);
  const claims = { userId: 'user-1', sessionId: 'session-1', mfa: true };

  it('signs and verifies EdDSA tokens with the key ID', async () => {
    const { token, expiresIn } = await service.sign(claims);
    expect(expiresIn).toBe(600);
    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString());
    expect(header).toMatchObject({ alg: 'EdDSA', kid: env.JWT_KEY_ID, typ: 'at+jwt' });
    expect(await service.verify(token)).toEqual(claims);
  });

  it('carries no roles or permissions', async () => {
    const { token } = await service.sign(claims);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'mfa', 'sid', 'sub']);
  });

  it('rejects tokens signed with another key', async () => {
    const other = new AccessTokenService(testEnv({ ...otherKeys() }));
    const { token } = await other.sign(claims);
    expect(await service.verify(token)).toBeNull();
  });

  it('rejects tampered, expired, "none"-algorithm and malformed tokens', async () => {
    const { token } = await service.sign(claims);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', sid: 'x', mfa: true })).toString(
      'base64url',
    );
    expect(await service.verify(`${h}.${forged}.${s}`)).toBeNull();

    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString('base64url')}.${forged}.`;
    expect(await service.verify(none)).toBeNull();

    const key = await importPKCS8(env.JWT_PRIVATE_KEY, 'EdDSA');
    const expired = await new SignJWT({ sid: 's', mfa: false })
      .setProtectedHeader({ alg: 'EdDSA', kid: env.JWT_KEY_ID, typ: 'at+jwt' })
      .setSubject('u')
      .setIssuer('iua-connect')
      .setAudience('iua-connect')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await service.verify(expired)).toBeNull();
    expect(await service.verify('not-a-jwt')).toBeNull();
  });
});

function otherKeys() {
  // A second, unrelated key pair (the key ID stays the same).
  const secrets = generateDevSecrets();
  return { JWT_PRIVATE_KEY: secrets.JWT_PRIVATE_KEY!, JWT_PUBLIC_KEY: secrets.JWT_PUBLIC_KEY! };
}
