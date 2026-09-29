import { testEnv } from '../../testing/test-env';
import { PasswordHasher } from './password-hasher';
import { FieldCipher, SecretHasher, randomToken, safeEqual } from './secrets';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with Argon2id and verifies', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(hash, 'wrong horse battery staple')).toBe(false);
  });

  it('normalizes Unicode, so composed and decomposed forms match', async () => {
    const hash = await hasher.hash('שלום-café-password');
    expect(await hasher.verify(hash, 'שלום-café-password')).toBe(true);
  });

  it('never throws on a malformed hash', async () => {
    expect(await hasher.verify('not-a-hash', 'x')).toBe(false);
  });

  it('flags hashes made with other parameters for rehashing', async () => {
    expect(hasher.needsRehash(await hasher.hash('x'))).toBe(false);
    expect(hasher.needsRehash('$argon2id$v=19$m=4096,t=3,p=1$c2FsdA$aGFzaA')).toBe(true);
    expect(hasher.needsRehash('$2b$10$bcrypthash')).toBe(true);
  });

  it('verifies against a dummy hash for unknown accounts', async () => {
    expect(await hasher.verifyDummy('anything')).toBe(false);
  });
});

describe('SecretHasher', () => {
  it('is deterministic per key and differs across keys', () => {
    const a = new SecretHasher(testEnv());
    const b = new SecretHasher(testEnv({ TOKEN_HASH_KEY: Buffer.alloc(32, 7).toString('base64') }));
    expect(a.hash('token')).toBe(a.hash('token'));
    expect(a.hash('token')).not.toBe(b.hash('token'));
    expect(a.hash('token')).not.toContain('token');
  });
});

describe('FieldCipher', () => {
  const cipher = new FieldCipher(testEnv());

  it('round-trips and uses a fresh IV each time', () => {
    const a = cipher.encrypt('JBSWY3DPEHPK3PXP');
    const b = cipher.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cipher.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampered ciphertext', () => {
    const [keyId, iv, ct, tag] = cipher.encrypt('secret').split('.');
    const flipped = Buffer.from(ct!, 'base64url');
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      cipher.decrypt([keyId, iv, flipped.toString('base64url'), tag].join('.')),
    ).toThrow();
  });

  it('rejects a truncated authentication tag', () => {
    const [keyId, iv, ct, tag] = cipher.encrypt('secret').split('.');
    const short = Buffer.from(tag!, 'base64url').subarray(0, 4).toString('base64url');
    expect(() => cipher.decrypt([keyId, iv, ct, short].join('.'))).toThrow();
  });

  it('decrypts with an older key after rotation', () => {
    const oldEnv = testEnv();
    const encrypted = new FieldCipher(oldEnv).encrypt('secret');
    const oldKeyId = oldEnv.FIELD_ENCRYPTION_KEY_ID;
    const oldKey = oldEnv.FIELD_ENCRYPTION_KEYS[oldKeyId]!.toString('base64');
    const rotated = testEnv({
      FIELD_ENCRYPTION_KEYS: `${oldKeyId}:${oldKey},k2:${Buffer.alloc(32, 9).toString('base64')}`,
      FIELD_ENCRYPTION_KEY_ID: 'k2',
    });
    const cipher2 = new FieldCipher(rotated);
    expect(cipher2.decrypt(encrypted)).toBe('secret');
    expect(cipher2.encrypt('x').startsWith('k2.')).toBe(true);
  });
});

describe('helpers', () => {
  it('makes 256-bit URL-safe tokens', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  it('compares strings safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
