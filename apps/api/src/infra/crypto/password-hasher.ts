import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/** Argon2id parameters (SECURITY_MODEL.md §3: m=19456 KiB, t=2, p=1 minimum). */
export const ARGON2_PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Unicode normalization before hashing, so the same password typed differently still matches. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

@Injectable()
export class PasswordHasher {
  /** A hash of a random value, verified against when an account doesn't exist (equal timing). */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(normalizePassword(password), ARGON2_PARAMS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, normalizePassword(password));
    } catch {
      return false;
    }
  }

  /** Spends the same time as a real verification, for accounts that don't exist. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(`dummy-${Math.random()}`);
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** True when the hash was made with weaker or different parameters than today's. */
  needsRehash(passwordHash: string): boolean {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash);
    if (!match) return true;
    const [, m, t, p] = match.map(Number);
    return (
      m !== ARGON2_PARAMS.memoryCost ||
      t !== ARGON2_PARAMS.timeCost ||
      p !== ARGON2_PARAMS.parallelism
    );
  }
}
