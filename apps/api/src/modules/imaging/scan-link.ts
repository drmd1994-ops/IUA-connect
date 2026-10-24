import { type SecretHasher, safeEqual } from '../../infra/crypto/secrets';

/** A viewer's link to one scan lives this long: long enough to read a study, then it is gone. */
export const SCAN_LINK_TTL_SEC = 2 * 60 * 60;

/**
 * The viewer's way in (M36 plan §4): `/api/v1/imaging/v/{scanId}.{exp}.{sig}/…`. The signature
 * binds the scan and the expiry, and it is issued only after the access check, so the link itself
 * is the permission, for this one scan, and only for reading it. It is in the path, not the query,
 * because the viewer adds its own paths and queries to the address it is given. The person's
 * session is never in it, so the app can open the viewer without handing over its sign-in.
 */
export class ScanLinkSigner {
  constructor(private readonly hasher: SecretHasher) {}

  sign(scanId: string, now = Date.now()): { token: string; expiresAt: string } {
    const exp = Math.floor(now / 1000) + SCAN_LINK_TTL_SEC;
    return {
      token: `${scanId}.${exp}.${this.signature(scanId, exp)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /** The scan a token opens, or null when it is forged, changed or expired. */
  verify(token: string, now = Date.now()): string | null {
    const [scanId, exp, sig, ...rest] = token.split('.');
    if (!scanId || !exp || !sig || rest.length) return null;
    const expiry = Number(exp);
    if (!Number.isInteger(expiry) || expiry * 1000 < now) return null;
    return safeEqual(this.signature(scanId, expiry), sig) ? scanId : null;
  }

  private signature(scanId: string, exp: number): string {
    return this.hasher.hash(`scan-link:${scanId}:${exp}`);
  }
}
