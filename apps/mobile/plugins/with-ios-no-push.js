// The iPhone app is installed with a free Apple ID (M37 plan §2, item 4), and Xcode refuses to
// sign an app that asks for Apple's push service with one. `expo-notifications` asks for it on
// every build ("aps-environment"), so it is taken out again here. Reminders scheduled on the phone
// itself (M32) don't need it. Push is M21, with a paid account; this plugin goes then.
// Android is not touched.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withIosNoPush(config) {
  return withEntitlementsPlist(config, (entitlements) => {
    delete entitlements.modResults['aps-environment'];
    return entitlements;
  });
};
