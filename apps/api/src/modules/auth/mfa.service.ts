import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@iua/shared';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { AppException } from '../../common/errors/app.exception';
import { FieldCipher, SecretHasher } from '../../infra/crypto/secrets';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { type MfaFactor } from '../../generated/prisma/client';

/** RFC 6238 parameters every authenticator app supports. */
export const TOTP_SETTINGS = {
  issuer: 'Med Connect',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
} as const;
/** Accept the previous and next 30-second step as well (clock drift). */
const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;
/** Unambiguous lower-case alphabet (no 0/o, 1/l/i). */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export interface TotpEnrollment {
  factorId: string;
  /** Base32 secret, for typing into an app that can't scan the QR code. */
  secret: string;
  otpauthUri: string;
  /** SVG QR code as a data URL (rendered here: no third-party QR service). */
  qrCode: string;
}

export type MfaCheck = { ok: true; method: 'totp' | 'recovery' } | { ok: false };

function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({ ...TOTP_SETTINGS, label, secret: Secret.fromBase32(secretBase32) });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function generateRecoveryCode(): string {
  const chars = Array.from(
    { length: 10 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/**
 * TOTP multi-factor authentication with single-use recovery codes (SECURITY_MODEL.md §3).
 * TOTP secrets are encrypted (AES-256-GCM); recovery codes are stored as keyed hashes.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly hasher: SecretHasher,
  ) {}

  async hasConfirmedFactor(userId: string): Promise<boolean> {
    return (await this.confirmedTotp(userId)) !== null;
  }

  /** Starts enrolment: a new unconfirmed factor (replacing any earlier unconfirmed one). */
  async startTotp(userId: string, email: string): Promise<TotpEnrollment> {
    if (await this.hasConfirmedFactor(userId)) throw new AppException('MFA_ALREADY_ENABLED');
    const secret = new Secret({ size: 20 });
    const totp = totpFor(secret.base32, email);
    const factorId = uuidv7();
    await this.prisma.$transaction([
      this.prisma.mfaFactor.deleteMany({ where: { userId, type: 'TOTP', confirmedAt: null } }),
      this.prisma.mfaFactor.create({
        data: {
          id: factorId,
          userId,
          type: 'TOTP',
          secretEncrypted: this.cipher.encrypt(secret.base32),
          label: 'Authenticator app',
        },
      }),
    ]);
    const otpauthUri = totp.toString();
    const svg = await QRCode.toString(otpauthUri, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return {
      factorId,
      secret: secret.base32,
      otpauthUri,
      qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    };
  }

  /** Confirms enrolment with a first valid code; returns fresh recovery codes (shown once). */
  async confirmTotp(userId: string, factorId: string, code: string): Promise<string[]> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { id: factorId, userId, type: 'TOTP', confirmedAt: null },
    });
    if (!factor) throw new AppException('NOT_FOUND');
    if (!(await this.checkTotp(factor, code))) throw new AppException('MFA_INVALID_CODE');
    await this.prisma.mfaFactor.update({
      where: { id: factor.id },
      data: { confirmedAt: new Date() },
    });
    return this.regenerateRecoveryCodes(userId);
  }

  /** Checks a TOTP code or a recovery code for a user with MFA enabled. */
  async verify(userId: string, code: string): Promise<MfaCheck> {
    const factor = await this.confirmedTotp(userId);
    if (!factor) return { ok: false };
    const trimmed = code.replace(/\s/g, '');
    if (/^\d{6}$/.test(trimmed)) {
      return (await this.checkTotp(factor, trimmed)) ? { ok: true, method: 'totp' } : { ok: false };
    }
    return (await this.useRecoveryCode(userId, code))
      ? { ok: true, method: 'recovery' }
      : { ok: false };
  }

  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((code) => ({
          id: uuidv7(),
          userId,
          codeHash: this.hasher.hash(normalizeRecoveryCode(code)),
        })),
      }),
    ]);
    return codes;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  /** Removes the user's TOTP factor and recovery codes. */
  async disable(userId: string, factorId: string): Promise<void> {
    const factor = await this.prisma.mfaFactor.findFirst({ where: { id: factorId, userId } });
    if (!factor) throw new AppException('NOT_FOUND');
    await this.prisma.$transaction([
      this.prisma.mfaFactor.delete({ where: { id: factor.id } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  confirmedTotp(userId: string): Promise<MfaFactor | null> {
    return this.prisma.mfaFactor.findFirst({
      where: { userId, type: 'TOTP', confirmedAt: { not: null } },
    });
  }

  // --- internals -------------------------------------------------------------

  /**
   * Validates a code and records its time step. A step at or before the last accepted one is a
   * replay and is refused (the conditional update makes this safe under concurrency).
   */
  private async checkTotp(factor: MfaFactor, code: string, now = Date.now()): Promise<boolean> {
    if (!factor.secretEncrypted) return false;
    const totp = totpFor(this.cipher.decrypt(factor.secretEncrypted), 'check');
    const delta = totp.validate({ token: code, timestamp: now, window: TOTP_WINDOW });
    if (delta === null) return false;
    const step = BigInt(Math.floor(now / 1000 / TOTP_SETTINGS.period) + delta);
    const { count } = await this.prisma.mfaFactor.updateMany({
      where: {
        id: factor.id,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step, lastUsedAt: new Date(now) },
    });
    return count === 1;
  }

  private async useRecoveryCode(userId: string, code: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length !== 10) return false;
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: this.hasher.hash(normalized), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }
}
