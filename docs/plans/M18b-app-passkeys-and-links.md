# M18b: Passkeys in the app, and email links that open it

**Status: approved by the owner on 2026-10-23 with the answers in §10. Proposed the same day ("start m18b").**

Track: Operate. Size: M. Needs first: M18 (the hosted demo's fixed address), merged on 2026-10-22.

## 0. What I checked on 2026-10-23

- **Passkeys work on the site** since M1b (`apps/api/src/modules/auth/passkeys.*`, `apps/web/src/features/auth/passkeys.ts`). The server checks a passkey against one domain (`WEBAUTHN_RP_ID`, today the site's host) and a list of allowed origins (`WEBAUTHN_ORIGIN`).
- **The app** says on its sign-in screen and its security screen: "Passkeys don't work in the app yet". It signs in with a password and, for staff, an authenticator code.
- **Email links** all point to the site (`APP_BASE_URL/<locale>/...`): confirming an email, a new password, the account set-up after an import, news, events, education, guidelines, a member, notifications, and the admin pages. On a phone they open the browser, even with the app installed.
- **The app's file** is built on GitHub (`.github/workflows/apk.yml`) and signed with the **debug key that comes with every new Expo project**. That key is public: anyone can sign an app with it. Android trusts a domain's passkeys and links only for apps whose signing key the domain names, so this key must not be the one named.
- **The app's Android name** is `test.demo.medconnect`. The app has no iPhone build (no Apple developer account), so this plan is Android only.

## 1. Goal

On an Android phone with the demo app:

1. A member signs in with a passkey (fingerprint, face or screen lock), and can add one from the app's security screen.
2. Tapping a link in a demo email opens the app on the matching screen, when the app has one; otherwise the browser opens, as today.

## 2. Scope

**In**

1. **A private signing key for the app,** made once, kept as GitHub secrets, used by the APK workflow. Its fingerprint (public) is written in the repository (§9, question 1).
2. **The site serves `/.well-known/assetlinks.json`,** naming the app and its key's fingerprint, for two permissions: passkeys (`get_login_creds`) and links (`handle_all_urls`). It is built from settings, not hard-coded, so a new address or key needs no code change.
3. **The server accepts the app's origin** (`android:apk-key-hash:<the key's hash>`) next to the site's, from a setting. Passkeys keep one domain: the site's. A passkey made on the site works in the app and the other way round.
4. **Passkeys in the app** through a library (§5): sign in with a passkey, add one, and see and remove them on the security screen, as on the site. The note "Passkeys don't work in the app yet" goes.
5. **App links (Android "verified links")** for the site's address, for these paths only:
   - the sign-in ones: confirm an email, set a new password, set up an account after an import;
   - content that has a screen in the app: news, events, education, guidelines, calculators, a member, notifications, a broadcast, chat.
     Admin pages and anything else stay in the browser.
6. **New app screens** for confirming an email and setting a new password from a link, as the site does today. Signed out, a content link shows the sign-in screen first, then the screen it pointed to.
7. **Settings** on Railway and the repository variables, and the steps in `DEPLOYMENT.md`.

**Not in**

| Item                      | Why                                                          |
| ------------------------- | ------------------------------------------------------------ |
| iPhone                    | No Apple developer account; the same work later, with one    |
| A bought domain           | The Railway address works; a new one only means new settings |
| Links into the admin area | The admin area isn't in the app (owner's decision, M14)      |
| The app in Google Play    | M21                                                          |

## 3. Rules

- **The private key never enters the repository,** nor this chat. I make it on this computer, hand it to GitHub through standard input as encrypted secrets, and keep no copy outside a place the owner chooses (§9, question 1). Only its public fingerprint is written down.
- **A phone that has the old app must uninstall it once:** Android refuses an update signed with a different key. Its sign-in and settings are lost; nothing on the server is.
- **Passkeys stay optional,** as on the site. The password and the authenticator code keep working.
- **Staff still need their second step.** As on the site, signing in with a passkey counts as both steps, and after a password a passkey can be the second step instead of the code. Nothing about staff rules changes.
- **A link never signs anyone in by itself.** A sign-in token in a link is used the same way as on the site: once, and with the same time limits.
- **No new texts without Hebrew and English.**

## 4. What is built

| Where  | What                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server | `WEBAUTHN_ORIGIN` accepts the app's `android:apk-key-hash:` origin; a check that it is well formed; tests that a passkey from the app's origin is accepted and one from an unknown app refused                         |
| Site   | `/.well-known/assetlinks.json` from two settings (`ANDROID_PACKAGE`, `ANDROID_CERT_SHA256`), outside the language routing; not served when they're empty                                                               |
| App    | The passkey library; sign in with a passkey; the passkeys list on the security screen; the app-links settings in `app.json`; screens for confirming an email and a new password; opening a link's screen after sign-in |
| GitHub | The APK workflow signs with the private key from secrets, and stops if they're missing                                                                                                                                 |
| Docs   | `DEPLOYMENT.md`: the settings, how to check the links (Android's own check), and what to do if the key is lost                                                                                                         |

## 5. New libraries, services and costs (each needs the owner's approval)

- **`react-native-passkey` 3.6.2** (MIT, f-23 on GitHub, published 2026-09-08): passkeys through Android's own Credential Manager. Without a library the app can't reach Android's passkeys. **Needs your approval** (§9, question 2).
- No new service, no cost.

## 6. Tests

- Server: unit tests for the origin setting; integration tests for a passkey sign-in from the app's origin, and refusals.
- Site: a test that `assetlinks.json` holds the right package and fingerprint, and isn't served when unset.
- App: component tests for the new screens and the passkey buttons (the library replaced by a stand-in); the link-to-screen table tested path by path.
- On your phone (the real test; passkeys and verified links can't be tried in a test runner): install the new app, add a passkey, sign out, sign in with it; then open a demo email's link and see the app open.

## 7. Order of work (a commit at each step; tests green at each)

1. The signing key and the workflow change; a new .apk to check it installs.
2. The server's app origin; the site's `assetlinks.json`.
3. Passkeys in the app.
4. App links, and the two new screens.
5. Settings on Railway (with you), deploy, a new .apk, your phone test.
6. `PROJECT_STATUS.md`, the demo.

## 8. Risks

- **Android checks the links once, when the app is installed.** If the site's file is wrong then, the links open the browser until the app is reinstalled. The steps say how to check first.
- **Some phones lack a screen lock or Google Play services;** passkeys then can't be used, and the app says so and offers the password.
- **A lost private key** means the next app can't update the old one, and the fingerprint in the settings must change. For a demo that's only a reinstall.
- **The Railway address** is the passkeys' domain. If it changes (a bought domain), passkeys made before stop working and must be made again.

## 9. Questions for the owner

1. **The app's signing key.** A private key kept as GitHub secrets (my recommendation), with a backup copy in a place you choose; or the public Expo key, which makes passkeys and links unsafe? Either way, your phone must uninstall the current app once.
2. **The library `react-native-passkey`:** may I add it?
3. **Which links open the app:** the sign-in links and the content that has an app screen (my recommendation), or the sign-in links only?
4. **Android only,** with iPhone later when there is an Apple developer account?

## 10. Owner answers

Answered on 2026-10-23, each with my recommendation:

1. **A private signing key,** kept as GitHub secrets, with a backup copy where the owner chooses.
2. **`react-native-passkey` 3.6.2** may be added.
3. **The sign-in links and the content that has an app screen** open the app; admin pages stay in the browser.
4. **Android only;** iPhone later, with an Apple developer account.
