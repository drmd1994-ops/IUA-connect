import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretHasher, randomToken } from '../../infra/crypto/secrets';
import { type AuthToken, type AuthTokenPurpose } from '../../generated/prisma/client';
import { AUTH_TOKEN_TTL_SEC } from './session-policy';

/** Purposes that always belong to a known account. */
export type AccountTokenPurpose = Exclude<AuthTokenPurpose, 'WEBAUTHN_AUTHENTICATION'>;
export type AccountToken = AuthToken & { userId: string };

type ChallengePurpose = Extract<
  AuthTokenPurpose,
  'WEBAUTHN_REGISTRATION' | 'WEBAUTHN_AUTHENTICATION'
>;

/**
 * Single-use, expiring tokens: email verification, password reset, the MFA sign-in challenge and
 * passkey (WebAuthn) challenges. Only a keyed hash is stored; the plain value exists only in the
 * email or the client.
 */
@Injectable()
export class AuthTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
  ) {}

  /** Issues an account token. The user's older unused tokens of the same purpose are invalidated. */
  async issue(userId: string, purpose: AccountTokenPurpose): Promise<string> {
    const token = randomToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.authToken.create({
        data: {
          id: uuidv7(),
          userId,
          purpose,
          tokenHash: this.hasher.hash(token),
          expiresAt: new Date(now.getTime() + AUTH_TOKEN_TTL_SEC[purpose] * 1000),
        },
      }),
    ]);
    return token;
  }

  /** Finds a usable (unused, unexpired) account token without consuming it. */
  async find(token: string, purpose: AccountTokenPurpose): Promise<AccountToken | null> {
    const row = await this.usable(token, purpose);
    return row?.userId ? (row as AccountToken) : null;
  }

  /** Consumes an account token atomically; returns it only if this call was the one that used it. */
  async consume(token: string, purpose: AccountTokenPurpose): Promise<AccountToken | null> {
    const row = await this.find(token, purpose);
    return row && (await this.markUsed(row.id)) ? row : null;
  }

  /**
   * Stores a WebAuthn challenge (the value the browser signs). Sign-in challenges have no user:
   * they are issued before anyone is identified, so nothing else is invalidated.
   */
  async issueChallenge(challenge: string, purpose: ChallengePurpose, userId: string | null) {
    await this.prisma.authToken.create({
      data: {
        id: uuidv7(),
        userId,
        purpose,
        tokenHash: this.hasher.hash(challenge),
        expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_SEC[purpose] * 1000),
      },
    });
  }

  /**
   * Consumes a WebAuthn challenge atomically. Registration challenges must belong to the user
   * completing the ceremony.
   */
  async consumeChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    userId: string | null,
  ): Promise<boolean> {
    const row = await this.usable(challenge, purpose);
    if (!row || row.userId !== userId) return false;
    return this.markUsed(row.id);
  }

  /** Counts a failed attempt; burns the token once the limit is reached. Returns attempts left. */
  async recordFailedAttempt(tokenId: string, maxAttempts: number): Promise<number> {
    const row = await this.prisma.authToken.update({
      where: { id: tokenId },
      data: { attempts: { increment: 1 } },
    });
    if (row.attempts >= maxAttempts) {
      await this.prisma.authToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } });
      return 0;
    }
    return maxAttempts - row.attempts;
  }

  private async usable(value: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: this.hasher.hash(value) },
    });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
    return row;
  }

  private async markUsed(id: string): Promise<boolean> {
    const { count } = await this.prisma.authToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }
}
