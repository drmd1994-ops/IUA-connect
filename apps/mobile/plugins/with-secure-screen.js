// The app's screens stay private (owner's decision, 2026-10-28): Android's recent-apps view shows
// a blank card instead of the last screen (a chat, a case, a scan), and screenshots and screen
// recordings of the app are blocked. Android's own FLAG_SECURE, set on the app's one window.
const { withMainActivity } = require('expo/config-plugins');

const FLAG = 'WindowManager.LayoutParams.FLAG_SECURE';

module.exports = function withSecureScreen(config) {
  return withMainActivity(config, (activity) => {
    let contents = activity.modResults.contents;
    if (contents.includes(FLAG)) return activity;
    if (activity.modResults.language !== 'kt' || !/super\.onCreate\([^)]*\)\n/.test(contents)) {
      throw new Error('with-secure-screen: MainActivity is not in the expected shape.');
    }
    contents = contents.replace(/^(package [^\n]+\n)/, '$1\nimport android.view.WindowManager\n');
    contents = contents.replace(
      /^(\s*)(super\.onCreate\([^)]*\)\n)/m,
      `$1$2$1window.setFlags(${FLAG}, ${FLAG})\n`,
    );
    activity.modResults.contents = contents;
    return activity;
  });
};
