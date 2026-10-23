// The app's own signing key for release builds (M18b plan §2.1). Android trusts the site's
// passkeys and links only for an app whose key the site names, so the release build must not use
// the public debug key a new Expo project comes with.
//
// The key is given to Gradle as properties, never written into the project:
//   -PmedconnectStoreFile=<path to the .p12> -PmedconnectStorePassword=... -PmedconnectKeyAlias=...
// Without them (a build on a developer's computer) the release build keeps the debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING_CONFIG = `
        release {
            if (findProperty('medconnectStoreFile')) {
                storeFile file(findProperty('medconnectStoreFile'))
                storeType 'pkcs12'
                storePassword findProperty('medconnectStorePassword')
                keyAlias findProperty('medconnectKeyAlias')
                keyPassword findProperty('medconnectStorePassword')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradle) => {
    let contents = gradle.modResults.contents;
    if (contents.includes('medconnectStoreFile')) return gradle;

    const configs = /signingConfigs \{\n(\s+debug \{[^}]*\})/;
    const release = /(release \{\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/;
    if (!configs.test(contents) || !release.test(contents)) {
      throw new Error('with-release-signing: app/build.gradle is not in the expected shape.');
    }
    contents = contents.replace(configs, (all) => `${all}${SIGNING_CONFIG}`);
    contents = contents.replace(
      release,
      "$1signingConfig findProperty('medconnectStoreFile') ? signingConfigs.release : signingConfigs.debug",
    );
    gradle.modResults.contents = contents;
    return gradle;
  });
};
