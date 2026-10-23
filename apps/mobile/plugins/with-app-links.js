// Email links that open the app (M18b plan §2.5): Android "verified links" for the site's
// address, for the paths in app-links.json only, in each of the site's languages. Android checks
// the site's /.well-known/assetlinks.json when the app is installed.
//
// The site's address is EXPO_PUBLIC_WEB_URL at build time; without an https address (a build on
// a developer's computer) no link is claimed and links open the browser, as before.
const { paths } = require('../app-links.json');

const LOCALES = ['he', 'en'];

/** "/news/*" → "/he/news/.*" (Android's path pattern; ".*" also matches what follows). */
function patterns() {
  return LOCALES.flatMap((locale) =>
    paths.map((path) => `/${locale}${path.replaceAll('*', '.*')}`),
  );
}

module.exports = function withAppLinks(config) {
  const site = process.env.EXPO_PUBLIC_WEB_URL;
  if (!site || !site.startsWith('https://')) return config;
  const host = new URL(site).host;
  config.android = {
    ...config.android,
    intentFilters: [
      ...(config.android?.intentFilters ?? []),
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: patterns().map((pathPattern) => ({ scheme: 'https', host, pathPattern })),
      },
    ],
  };
  return config;
};

module.exports.patterns = patterns;
