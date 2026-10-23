import { describe, expect, it } from 'vitest';
import { assetLinks } from './asset-links';

const print = Array.from({ length: 32 }, () => 'ab').join(':');

describe('the site’s asset links (M18b)', () => {
  it('names the app and its key for passkeys and links', () => {
    expect(assetLinks(' test.demo.medconnect ', ` ${print} `)).toEqual([
      {
        relation: [
          'delegate_permission/common.get_login_creds',
          'delegate_permission/common.handle_all_urls',
        ],
        target: {
          namespace: 'android_app',
          package_name: 'test.demo.medconnect',
          sha256_cert_fingerprints: [print.toUpperCase()],
        },
      },
    ]);
  });

  it('serves nothing when a setting is missing or malformed', () => {
    expect(assetLinks(undefined, print)).toBeNull();
    expect(assetLinks('test.demo.medconnect', undefined)).toBeNull();
    expect(assetLinks('test.demo.medconnect', 'AB:CD')).toBeNull();
    expect(assetLinks('not a package', print)).toBeNull();
  });
});
