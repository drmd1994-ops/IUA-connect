/**
 * The site's Digital Asset Links (M18b plan §2.2): Android lets the app named here use this
 * site's passkeys, and open its links, only when the app is signed with one of these keys.
 * Built from two settings, so a new address or key needs no change to the code.
 */
const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;
const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;

export interface AssetLink {
  relation: string[];
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] };
}

/** The statements, or null when the settings are missing or malformed (then nothing is served). */
export function assetLinks(
  androidPackage: string | undefined,
  fingerprints: string | undefined,
): AssetLink[] | null {
  const name = androidPackage?.trim() ?? '';
  const prints = (fingerprints ?? '')
    .split(',')
    .map((print) => print.trim().toUpperCase())
    .filter(Boolean);
  if (!PACKAGE.test(name) || prints.length === 0 || !prints.every((p) => FINGERPRINT.test(p))) {
    return null;
  }
  return [
    {
      relation: [
        'delegate_permission/common.get_login_creds',
        'delegate_permission/common.handle_all_urls',
      ],
      target: { namespace: 'android_app', package_name: name, sha256_cert_fingerprints: prints },
    },
  ];
}
