import { Inject, Injectable } from '@nestjs/common';
import { type CryptoKey, SignJWT, importPKCS8, importSPKI, jwtVerify } from 'jose';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { ACCESS_TOKEN_TTL_SEC } from './session-policy';

const ISSUER = 'iua-connect';
const AUDIENCE = 'iua-connect';
const ALGORITHM = 'EdDSA';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  mfa: boolean;
}

/**
 * Access tokens: JWT signed with EdDSA (Ed25519), 10 minutes (API_DESIGN.md §3). Claims: sub,
 * sid, mfa. Roles and permissions are deliberately not in the token.
 */
@Injectable()
export class AccessTokenService {
  private readonly keys: Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }>;

  constructor(@Inject(APP_CONFIG) private readonly env: Env) {
    this.keys = Promise.all([
      importPKCS8(env.JWT_PRIVATE_KEY, ALGORITHM),
      importSPKI(env.JWT_PUBLIC_KEY, ALGORITHM),
    ]).then(([privateKey, publicKey]) => ({ privateKey, publicKey }));
  }

  async sign(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }> {
    const { privateKey } = await this.keys;
    const token = await new SignJWT({ sid: claims.sessionId, mfa: claims.mfa })
      .setProtectedHeader({ alg: ALGORITHM, kid: this.env.JWT_KEY_ID, typ: 'at+jwt' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .sign(privateKey);
    return { token, expiresIn: ACCESS_TOKEN_TTL_SEC };
  }

  /** Returns the claims of a valid token, or null (bad signature, expired, wrong key or shape). */
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { publicKey } = await this.keys;
      const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: AUDIENCE,
        typ: 'at+jwt',
      });
      if (protectedHeader.kid !== this.env.JWT_KEY_ID) return null;
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid, mfa: payload.mfa === true };
    } catch {
      return null;
    }
  }
}
