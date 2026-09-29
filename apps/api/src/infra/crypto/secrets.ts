import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';

/** A URL-safe random token with 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Keyed hashes (HMAC-SHA-256) for values that are looked up but must never be stored in the clear:
 * refresh tokens, email-link tokens, recovery codes, device cookies. A database leak alone doesn't
 * let anyone derive usable tokens.
 */
@Injectable()
export class SecretHasher {
  constructor(@Inject(APP_CONFIG) private readonly env: Env) {}

  hash(value: string): string {
    return createHmac('sha256', this.env.TOKEN_HASH_KEY).update(value).digest('base64url');
  }
}

/**
 * AES-256-GCM for fields that must be decrypted later (TOTP secrets; certificate numbers in M2).
 * Format: "<keyId>.<iv>.<ciphertext>.<tag>" (base64url parts), so keys can be rotated.
 */
const GCM_TAG_BYTES = 16;

@Injectable()
export class FieldCipher {
  constructor(@Inject(APP_CONFIG) private readonly env: Env) {}

  encrypt(plaintext: string): string {
    const keyId = this.env.FIELD_ENCRYPTION_KEY_ID;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(keyId), iv, {
      authTagLength: GCM_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(keyId));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [keyId, iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(payload: string): string {
    const [keyId, iv, ciphertext, tag] = payload.split('.');
    if (!keyId || !iv || !ciphertext || !tag) throw new Error('Malformed encrypted field');
    const authTag = Buffer.from(tag, 'base64url');
    // A shortened tag would weaken forgery protection; accept only the full 16 bytes.
    if (authTag.length !== GCM_TAG_BYTES) throw new Error('Malformed encrypted field');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(keyId),
      Buffer.from(iv, 'base64url'),
      { authTagLength: GCM_TAG_BYTES },
    );
    decipher.setAAD(Buffer.from(keyId));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(keyId: string): Buffer {
    const key = this.env.FIELD_ENCRYPTION_KEYS[keyId];
    if (!key) throw new Error('Unknown field-encryption key ID');
    return key;
  }
}
