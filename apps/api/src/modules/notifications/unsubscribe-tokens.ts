import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_NOTIFICATION_KINDS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from '@iua/shared';
import { type CryptoKey, SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';

const ISSUER = 'iua-connect';
/** Its own audience and type, so this link never passes for an access, card or check-in token. */
const AUDIENCE = 'iua-unsubscribe';
const TYPE = 'unsubscribe+jwt';
const ALGORITHM = 'EdDSA';
export const UNSUBSCRIBE_TTL_SEC = 60 * 24 * 60 * 60;

/** What a link switches off: one kind, or the daily summary (every kind of new content). */
export type UnsubscribeScope = NotificationKind | 'CONTENT';

export interface UnsubscribeTarget {
  userId: string;
  kinds: NotificationKind[];
}

/** The kinds a scope covers. Kinds that are always on can't be switched off by a link either. */
export function kindsOf(scope: UnsubscribeScope): NotificationKind[] {
  const kinds: readonly NotificationKind[] =
    scope === 'CONTENT' ? CONTENT_NOTIFICATION_KINDS : [scope];
  return kinds.filter((kind) => !NOTIFICATION_DEFAULTS[kind].locked);
}

/**
 * The link at the end of an email that a switch controls (M7 plan §2.5): a signed token naming
 * the person and what to switch off, valid for 60 days. It switches off email for that kind and
 * nothing else; it gives no access to the account.
 */
@Injectable()
export class UnsubscribeTokens {
  private readonly keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;

  constructor(@Inject(APP_CONFIG) private readonly env: Env) {
    this.keys = Promise.all([
      importPKCS8(env.JWT_PRIVATE_KEY, ALGORITHM),
      importSPKI(env.JWT_PUBLIC_KEY, ALGORITHM),
    ]).then(([privateKey, publicKey]) => ({ privateKey, publicKey }));
  }

  async issue(userId: string, scope: UnsubscribeScope, now = new Date()): Promise<string> {
    const { privateKey } = await this.keys;
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ k: scope })
      .setProtectedHeader({ alg: ALGORITHM, kid: this.env.JWT_KEY_ID, typ: TYPE })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + UNSUBSCRIBE_TTL_SEC)
      .sign(privateKey);
  }

  /** Who and what the link names; null when it is expired, altered or another kind of token. */
  async verify(token: string, now = new Date()): Promise<UnsubscribeTarget | null> {
    try {
      const { publicKey } = await this.keys;
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: TYPE,
        currentDate: now,
      });
      if (protectedHeader.kid !== this.env.JWT_KEY_ID || typeof payload.sub !== 'string') {
        return null;
      }
      const scope = payload.k;
      if (scope !== 'CONTENT' && !(NOTIFICATION_KINDS as readonly unknown[]).includes(scope)) {
        return null;
      }
      const kinds = kindsOf(scope as UnsubscribeScope);
      return kinds.length > 0 ? { userId: payload.sub, kinds } : null;
    } catch {
      return null;
    }
  }
}
