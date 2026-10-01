import { Inject, Injectable } from '@nestjs/common';
import { type CryptoKey, SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';

const ISSUER = 'iua-connect';
/** Its own audience and type, so a check-in code never passes for an access or card token. */
const AUDIENCE = 'iua-checkin';
const TYPE = 'checkin+jwt';
const ALGORITHM = 'EdDSA';
export const CHECK_IN_TTL_SEC = 5 * 60;

export interface CheckInTarget {
  eventId: string;
  /** Null: attendance at the event as a whole. */
  sessionId: string | null;
}

/**
 * The code behind the QR an event admin shows at the venue (M5 plan §2.6, §11.3): a signed token
 * naming the event (and the session, if any), valid for five minutes. The admin's screen renews
 * it, so a photo of the code can't be used later or from elsewhere for long.
 */
@Injectable()
export class CheckInTokens {
  private readonly keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;

  constructor(@Inject(APP_CONFIG) private readonly env: Env) {
    this.keys = Promise.all([
      importPKCS8(env.JWT_PRIVATE_KEY, ALGORITHM),
      importSPKI(env.JWT_PUBLIC_KEY, ALGORITHM),
    ]).then(([privateKey, publicKey]) => ({ privateKey, publicKey }));
  }

  async issue(
    target: CheckInTarget,
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date }> {
    const { privateKey } = await this.keys;
    const expiresAt = new Date(now.getTime() + CHECK_IN_TTL_SEC * 1000);
    const token = await new SignJWT(target.sessionId ? { sid: target.sessionId } : {})
      .setProtectedHeader({ alg: ALGORITHM, kid: this.env.JWT_KEY_ID, typ: TYPE })
      .setSubject(target.eventId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(privateKey);
    return { token, expiresAt };
  }

  /** What the code names; null when it is expired, altered or another kind of token. */
  async verify(token: string): Promise<CheckInTarget | null> {
    try {
      const { publicKey } = await this.keys;
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: TYPE,
      });
      if (protectedHeader.kid !== this.env.JWT_KEY_ID || typeof payload.sub !== 'string') {
        return null;
      }
      const sessionId = payload.sid;
      if (sessionId !== undefined && typeof sessionId !== 'string') return null;
      return { eventId: payload.sub, sessionId: sessionId ?? null };
    } catch {
      return null;
    }
  }
}
