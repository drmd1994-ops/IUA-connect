import { SecretHasher } from '../../infra/crypto/secrets';
import { testEnv } from '../../testing/test-env';
import { SCAN_LINK_TTL_SEC, ScanLinkSigner } from './scan-link';

const links = new ScanLinkSigner(new SecretHasher(testEnv()));
const ID = '0190a000-0000-7000-8000-00000000f11e';
const OTHER = '0190a000-0000-7000-8000-00000000beef';

describe('ScanLinkSigner (M36)', () => {
  it('opens its one scan until it expires', () => {
    const now = Date.now();
    const { token } = links.sign(ID, now);
    expect(links.verify(token, now)).toBe(ID);
    expect(links.verify(token, now + (SCAN_LINK_TTL_SEC - 1) * 1000)).toBe(ID);
    expect(links.verify(token, now + (SCAN_LINK_TTL_SEC + 1) * 1000)).toBeNull();
  });

  it('opens nothing when the scan, the expiry or the signature is changed', () => {
    const { token } = links.sign(ID);
    const [, exp, sig] = token.split('.');
    expect(links.verify(`${OTHER}.${exp}.${sig}`)).toBeNull();
    expect(links.verify(`${ID}.${Number(exp) + 3600}.${sig}`)).toBeNull();
    expect(links.verify(`${ID}.${exp}.${sig}x`)).toBeNull();
    expect(links.verify(`${token}.more`)).toBeNull();
    expect(links.verify('')).toBeNull();
  });
});
