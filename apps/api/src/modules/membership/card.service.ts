import { Inject, Injectable } from '@nestjs/common';
import { type CryptoKey, SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ORGANISATION_REF, type OrganisationRef } from '../organisations';
import { effectiveStatus } from './memberships.service';
import { todayInIsrael } from './period';

const ISSUER = 'iua-connect';
/** A different audience and type from access tokens, so neither passes for the other. */
const AUDIENCE = 'iua-card';
const TYPE = 'card+jwt';
const ALGORITHM = 'EdDSA';
export const CARD_TOKEN_TTL_SEC = 5 * 60;

export interface CardToken {
  token: string;
  expiresAt: string;
}

export interface CardVerification {
  valid: boolean;
  name: string | null;
  /** Whose card it is. */
  organisation: OrganisationRef | null;
  type: { key: string; nameHe: string; nameEn: string } | null;
}

const INVALID: CardVerification = { valid: false, name: null, organisation: null, type: null };

/**
 * The digital membership card's QR code (PRODUCT_REQUIREMENTS §3.3): a short-lived signed token
 * that names only the membership (an opaque ID), never the person or their numbers. Scanning it
 * opens the public verification page, which shows valid/invalid, the name and the type.
 */
@Injectable()
export class CardService {
  private readonly keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.keys = Promise.all([
      importPKCS8(env.JWT_PRIVATE_KEY, ALGORITHM),
      importSPKI(env.JWT_PUBLIC_KEY, ALGORITHM),
    ]).then(([privateKey, publicKey]) => ({ privateKey, publicKey }));
  }

  /**
   * A fresh token for the member's card in one organisation. Only an active membership gets one.
   */
  async issue(userId: string, organisationId: string | null): Promise<CardToken> {
    // No organisation: the person belongs to none, so there is no card to issue.
    const membership = organisationId
      ? await this.prisma.membership.findUnique({
          where: { userId_organisationId: { userId, organisationId } },
        })
      : null;
    if (!membership || effectiveStatus(membership, todayInIsrael()) !== 'ACTIVE') {
      throw new AppException('BUSINESS_RULE_VIOLATION', [{ code: 'noActiveMembership' }]);
    }
    const { privateKey } = await this.keys;
    const expiresAt = new Date(Date.now() + CARD_TOKEN_TTL_SEC * 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: ALGORITHM, kid: this.env.JWT_KEY_ID, typ: TYPE })
      .setSubject(membership.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(privateKey);
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Checks a scanned token. Anything wrong (tampered, expired, another kind of token) and any
   * membership that isn't active right now reads simply as "not valid", without saying why.
   */
  async verify(token: string): Promise<CardVerification> {
    let membershipId: string;
    try {
      const { publicKey } = await this.keys;
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: TYPE,
      });
      if (protectedHeader.kid !== this.env.JWT_KEY_ID || typeof payload.sub !== 'string') {
        return INVALID;
      }
      membershipId = payload.sub;
    } catch {
      return INVALID;
    }
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        type: true,
        organisation: { select: { ...ORGANISATION_REF, active: true } },
        user: { select: { status: true, profile: true } },
      },
    });
    if (
      !membership ||
      !membership.organisation.active ||
      membership.user.status !== 'ACTIVE' ||
      effectiveStatus(membership, todayInIsrael()) !== 'ACTIVE'
    ) {
      return INVALID;
    }
    const profile = membership.user.profile;
    const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || null;
    const { active: _active, ...organisation } = membership.organisation;
    return {
      valid: true,
      name,
      organisation,
      type: {
        key: membership.type.key,
        nameHe: membership.type.nameHe,
        nameEn: membership.type.nameEn,
      },
    };
  }
}
