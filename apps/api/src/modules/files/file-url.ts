import { type SecretHasher, safeEqual } from '../../infra/crypto/secrets';

/** Signed download links live this long (SECURITY_MODEL.md "Files": short-lived). */
export const FILE_URL_TTL_SEC = 5 * 60;

export type Variant = 'full' | 'thumb';

/**
 * Short-lived download links: `/api/v1/files/{id}/content?v=&exp=&sig=`. The signature (a keyed
 * hash) binds the file, the variant and the expiry, so a link can't be changed to another file or
 * extended. It is issued only after an access check, so the link itself is the permission.
 */
export class FileUrlSigner {
  constructor(private readonly hasher: SecretHasher) {}

  sign(fileId: string, variant: Variant, now = Date.now()): { url: string; expiresAt: string } {
    const exp = Math.floor(now / 1000) + FILE_URL_TTL_SEC;
    const sig = this.signature(fileId, variant, exp);
    const query = new URLSearchParams({ v: variant, exp: String(exp), sig });
    return {
      url: `/api/v1/files/${fileId}/content?${query.toString()}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  verify(fileId: string, variant: string, exp: string, sig: string, now = Date.now()): boolean {
    if (variant !== 'full' && variant !== 'thumb') return false;
    const expiry = Number(exp);
    if (!Number.isInteger(expiry) || expiry * 1000 < now) return false;
    return safeEqual(this.signature(fileId, variant, expiry), sig);
  }

  private signature(fileId: string, variant: Variant, exp: number): string {
    return this.hasher.hash(`file-url:${fileId}:${variant}:${exp}`);
  }
}
