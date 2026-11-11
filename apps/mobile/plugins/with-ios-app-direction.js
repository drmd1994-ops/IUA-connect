// The app chooses its own language, and with it the direction of the page (src/i18n/i18n-provider:
// I18nManager.forceRTL, applied the next time the app starts). On iOS, expo-localization sets the
// direction again on every launch from the phone's language when the app declares
// "ExpoLocalization_supportsRTL", so Hebrew chosen in the app on an English iPhone never turned
// right to left (found in the simulator, M37). Without the key it leaves the direction alone.
// Android reads its own setting and is not touched.
const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withIosAppDirection(config) {
  return withInfoPlist(config, (plist) => {
    delete plist.modResults.ExpoLocalization_supportsRTL;
    delete plist.modResults.ExpoLocalization_forcesRTL;
    return plist;
  });
};
