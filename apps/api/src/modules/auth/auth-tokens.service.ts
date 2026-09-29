import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SecretHasher, randomToken } from '../../infra/crypto/secrets';
import { type AuthToken, type AuthTokenPurpose } from '../../generated/prisma/client';
import { AUTH_TOKEN_TTL_SEC } from './session-policy';

/**
 * Single-use, expiring tokens: email verification, password reset and the MFA sign-in challenge.
 * Only a keyed hash is stored; the plain token exists only in the email or the client.
 */
@Injectable()
export class AuthTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: SecretHasher,
  ) {}

  /** Issues a token. Older unused tokens of the same purpose for the user are invalidated. */
  async issue(userId: string, purpose: AuthTokenPurpose): Promise<string> {
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

  /** Finds a usable (unused, unexpired) token without consuming it. */
  async find(token: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: this.hasher.hash(token) },
    });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= new Date()) return null;
    return row;
  }

  /** Consumes a token atomically; returns it only if this call was the one that used it. */
  async consume(token: string, purpose: AuthTokenPurpose): Promise<AuthToken | null> {
    const row = await this.find(token, purpose);
    if (!row) return null;
    const { count } = await this.prisma.authToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1 ? row : null;
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
}
