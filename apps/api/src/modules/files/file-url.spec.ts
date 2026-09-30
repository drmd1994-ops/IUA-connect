import { SecretHasher } from '../../infra/crypto/secrets';
import { testEnv } from '../../testing/test-env';
import { FILE_URL_TTL_SEC, FileUrlSigner } from './file-url';

const signer = new FileUrlSigner(new SecretHasher(testEnv()));
const ID = '0190a000-0000-7000-8000-00000000f11e';
const OTHER = '0190a000-0000-7000-8000-00000000beef';

function parts(url: string) {
  const query = new URL(url, 'http://x').searchParams;
  return { v: query.get('v')!, exp: query.get('exp')!, sig: query.get('sig')! };
}

describe('FileUrlSigner', () => {
  it('signs a link that verifies until it expires', () => {
    const now = Date.now();
    const { url, expiresAt } = signer.sign(ID, 'full', now);
    expect(url).toMatch(new RegExp(`^/api/v1/files/${ID}/content\\?`));
    expect(new Date(expiresAt).getTime()).toBeLessThanOrEqual(now + FILE_URL_TTL_SEC * 1000);
    const { v, exp, sig } = parts(url);
    expect(signer.verify(ID, v, exp, sig, now)).toBe(true);
    expect(signer.verify(ID, v, exp, sig, now + (FILE_URL_TTL_SEC + 1) * 1000)).toBe(false);
  });

  it('binds the file, the variant and the expiry', () => {
    const { v, exp, sig } = parts(signer.sign(ID, 'thumb').url);
    expect(signer.verify(OTHER, v, exp, sig)).toBe(false);
    expect(signer.verify(ID, 'full', exp, sig)).toBe(false);
    expect(signer.verify(ID, v, String(Number(exp) + 3600), sig)).toBe(false);
    expect(signer.verify(ID, 'original', exp, sig)).toBe(false);
    expect(signer.verify(ID, v, 'soon', sig)).toBe(false);
    expect(signer.verify(ID, v, exp, 'forged')).toBe(false);
  });
});
