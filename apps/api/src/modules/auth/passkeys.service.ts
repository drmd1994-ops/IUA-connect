import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from '@medconnect/shared';
import {
  type AuthenticationResponseJSON,
  type WebAuthnCredential,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { type MfaFactor } from '../../generated/prisma/client';
import { UsersService } from '../users';
import { AuthTokensService } from './auth-tokens.service';

const RP_NAME = 'Med Connect';

export interface PasskeySummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** Synced across the person's devices (e.g. iCloud Keychain, Google Password Manager). */
  synced: boolean;
}

export type PasskeyCheck =
  | { ok: true; factor: MfaFactor }
  | { ok: false; reason: 'unknown_credential' | 'invalid' | 'counter_regression' };

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/**
 * Passkeys (WebAuthn, docs/plans/M1b-passkeys.md). User verification (fingerprint, face or PIN) is
 * required on every ceremony, so a passkey counts as two factors. Stored in mfa_factors (type
 * WEBAUTHN): only the public key; challenges are single-use keyed hashes in auth_tokens.
 */
@Injectable()
export class PasskeysService {
  private readonly logger = new Logger(PasskeysService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokensService,
    private readonly users: UsersService,
  ) {}

  // --- registration --------------------------------------------------------------

  async registrationOptions(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppException('UNAUTHENTICATED');
    const existing = await this.passkeysOf(userId);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: this.env.WEBAUTHN_RP_ID,
      userName: user.email,
      userID: Buffer.from(user.id.replace(/-/g, ''), 'hex'),
      attestationType: 'none', // synced and device-bound passkeys are both accepted (owner decision)
      excludeCredentials: existing.map((factor) => ({
        id: toBase64Url(factor.credentialId!),
        transports: factor.transports,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await this.tokens.issueChallenge(options.challenge, 'WEBAUTHN_REGISTRATION', userId);
    return options;
  }

  async register(
    userId: string,
    response: RegistrationResponseJSON,
    name: string,
  ): Promise<PasskeySummary> {
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) =>
          this.tokens.consumeChallenge(challenge, 'WEBAUTHN_REGISTRATION', userId),
        expectedOrigin: this.env.WEBAUTHN_ORIGIN,
        expectedRPID: this.env.WEBAUTHN_RP_ID,
        requireUserVerification: true,
      });
    } catch (error) {
      this.logger.warn({ err: (error as Error).message }, 'Passkey registration rejected');
      throw new AppException('PASSKEY_INVALID');
    }
    if (!verification.verified) throw new AppException('PASSKEY_INVALID');

    const { credential, credentialBackedUp } = verification.registrationInfo;
    const credentialId = Buffer.from(credential.id, 'base64url');
    const duplicate = await this.prisma.mfaFactor.findUnique({ where: { credentialId } });
    if (duplicate) throw new AppException('CONFLICT');

    const factor = await this.prisma.mfaFactor.create({
      data: {
        id: uuidv7(),
        userId,
        type: 'WEBAUTHN',
        credentialId,
        credentialPublicKey: Buffer.from(credential.publicKey),
        signCount: BigInt(credential.counter),
        transports: credential.transports ?? [],
        backedUp: credentialBackedUp,
        label: name,
        confirmedAt: new Date(),
      },
    });
    return summarize(factor);
  }

  // --- management ------------------------------------------------------------------

  async list(userId: string): Promise<PasskeySummary[]> {
    return (await this.passkeysOf(userId)).map(summarize);
  }

  async rename(userId: string, passkeyId: string, name: string): Promise<PasskeySummary> {
    const factor = await this.ownPasskey(userId, passkeyId);
    return summarize(
      await this.prisma.mfaFactor.update({ where: { id: factor.id }, data: { label: name } }),
    );
  }

  /**
   * Removes a passkey. Someone whose role requires MFA must keep at least one factor (another
   * passkey or the authenticator app).
   */
  async remove(userId: string, passkeyId: string): Promise<void> {
    const factor = await this.ownPasskey(userId, passkeyId);
    const profile = await this.users.accessProfile(userId);
    if (profile.requiresMfa) {
      const others = await this.prisma.mfaFactor.count({
        where: { userId, confirmedAt: { not: null }, id: { not: factor.id } },
      });
      if (others === 0) throw new AppException('MFA_REQUIRED_BY_ROLE');
    }
    await this.prisma.mfaFactor.delete({ where: { id: factor.id } });
  }

  // --- authentication ------------------------------------------------------------------

  /** Options for signing in (discoverable: the browser offers the person's passkeys). */
  async authenticationOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
      rpID: this.env.WEBAUTHN_RP_ID,
      userVerification: 'required',
    });
    await this.tokens.issueChallenge(options.challenge, 'WEBAUTHN_AUTHENTICATION', null);
    return options;
  }

  /**
   * Verifies a sign-in assertion. On success the passkey's counter and last use are updated. A
   * counter that goes backwards (on authenticators that count) suggests a cloned key: refused.
   */
  async verify(response: AuthenticationResponseJSON): Promise<PasskeyCheck> {
    const factor = await this.prisma.mfaFactor.findUnique({
      where: { credentialId: Buffer.from(response.rawId, 'base64url') },
    });
    if (!factor || factor.type !== 'WEBAUTHN' || !factor.credentialPublicKey) {
      return { ok: false, reason: 'unknown_credential' };
    }
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) =>
          this.tokens.consumeChallenge(challenge, 'WEBAUTHN_AUTHENTICATION', null),
        expectedOrigin: this.env.WEBAUTHN_ORIGIN,
        expectedRPID: this.env.WEBAUTHN_RP_ID,
        credential: {
          id: toBase64Url(factor.credentialId!),
          publicKey: new Uint8Array(factor.credentialPublicKey),
          counter: Number(factor.signCount),
          transports: factor.transports as WebAuthnCredential['transports'],
        },
        requireUserVerification: true,
      });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn({ err: message, factorId: factor.id }, 'Passkey assertion rejected');
      return { ok: false, reason: /counter/i.test(message) ? 'counter_regression' : 'invalid' };
    }
    if (!verification.verified) return { ok: false, reason: 'invalid' };

    const { newCounter, credentialBackedUp } = verification.authenticationInfo;
    const updated = await this.prisma.mfaFactor.update({
      where: { id: factor.id },
      data: {
        signCount: BigInt(newCounter),
        backedUp: credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    return { ok: true, factor: updated };
  }

  // --- helpers ---------------------------------------------------------------------------

  private passkeysOf(userId: string): Promise<MfaFactor[]> {
    return this.prisma.mfaFactor.findMany({
      where: { userId, type: 'WEBAUTHN' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** The user's own passkey, or 404 (never reveals that someone else's exists). */
  private async ownPasskey(userId: string, passkeyId: string): Promise<MfaFactor> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { id: passkeyId, userId, type: 'WEBAUTHN' },
    });
    if (!factor) throw new AppException('NOT_FOUND');
    return factor;
  }
}

function summarize(factor: MfaFactor): PasskeySummary {
  return {
    id: factor.id,
    name: factor.label ?? '',
    createdAt: factor.createdAt.toISOString(),
    lastUsedAt: factor.lastUsedAt?.toISOString() ?? null,
    synced: factor.backedUp === true,
  };
}
