import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { DEV_KEY_PREFIX } from './env.schema';

/**
 * Fresh throwaway secrets for tests and the offline OpenAPI export. Development machines get
 * persistent ones from `pnpm setup:dev` (tools/scripts/setup-dev.mjs uses the same format).
 */
export function generateDevSecrets(): Record<string, string> {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = (value: string) => Buffer.from(value).toString('base64');
  const keyId = `${DEV_KEY_PREFIX}${randomBytes(4).toString('hex')}`;
  return {
    JWT_PRIVATE_KEY: pem(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
    JWT_PUBLIC_KEY: pem(publicKey.export({ type: 'spki', format: 'pem' }).toString()),
    JWT_KEY_ID: keyId,
    TOKEN_HASH_KEY: randomBytes(32).toString('base64'),
    FIELD_ENCRYPTION_KEYS: `${keyId}:${randomBytes(32).toString('base64')}`,
    FIELD_ENCRYPTION_KEY_ID: keyId,
  };
}
