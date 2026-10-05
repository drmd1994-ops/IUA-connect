# M14 — Mobile app, part 1 (the member's app): plan

- Status: **Approved by the owner on 2026-10-05,** with the answers in §11.
- Date: 2026-10-05
- Asked for by the owner: "write the plan for the mobile app but do not start coding before i approve the plan" (2026-10-05).
- Design sources: [ADR 0007](../adr/0007-web-first-delivery.md) (web first, mobile once the API is stable), `DEVELOPMENT_ROADMAP.md` (an Expo app in `apps/mobile`), `ARCHITECTURE.md` §5 (`PushProvider`, built as a connection point in M10), `SECURITY_MODEL.md`, `docs/product/MASTER_SPEC.md`.
- Builds on: everything through M13. **M13 must be merged first** (its pull request is open).

## 1. What I checked before writing this

So that the plan rests on what the project is today, not on what the early documents hoped.

**Ready**

- **One API serves everything.** The web app has no logic of its own that a phone would lack: every screen asks `/api/v1`. All 301 unit and 466 integration tests of the API pass.
- **A typed client** (`packages/api-client`), generated from the API. It uses the standard `fetch`, which a phone app has too.
- **All texts** in Hebrew and English (`packages/i18n`), as plain files that an app can read.
- **Design tokens** (`packages/ui-tokens`): colours, spacing and type sizes in a form meant for both web and mobile.
- **A connection point for push notifications** (`PushProvider`, M10). The server already hands it every in-app notice. Nothing is plugged in.

**Not ready: what the app needs that the server does not have**

1. **Sign-in for an app.** Today the long-lived part of a session (the refresh token) travels only in a browser cookie, protected by a second header that only the site's own pages can send. A phone app has no such cookie jar to rely on. The server needs a second, explicit way: the app receives the refresh token in the answer and keeps it in the phone's secure storage (Keychain on iPhone, Keystore on Android). **This is a security-sensitive change to sign-in,** so it is in this plan as its own checkpoint, with its own tests, and not done quietly.
2. **Devices for push.** There is no table of phones and no route for a phone to say "send my notices here".
3. **Passkeys on a phone** need a real web address that the app is tied to (Apple and Google check it). The demo runs on one computer with no address of its own. **Passkeys can't work in the app until the site has real hosting.** Sign-in with password and authenticator code works.

**Not ready: this computer**

- No Android tools, no Java, no Expo tools are installed (checked: `adb`, `java`, `emulator`, `expo`, `eas` are all missing). An iPhone app can't be built on Windows at all; it is built in Expo's cloud service or on a Mac.
- The simplest way to see the app with nothing large installed: the free **Expo Go** app on your own phone, on the same Wi-Fi as this computer (question 2).

**Not known yet, to be tried in the first checkpoint**

- Whether chat's live connection (a long-running response read piece by piece) works on a phone. Recent Expo versions support it; it was never tried here. If it doesn't, the app asks every few seconds instead, as the web does when its connection fails.
- How right-to-left behaves when the language is changed inside the app. On phones a change of direction usually needs the app to restart.

## 2. Goal and exit criteria

A member carries the association in their pocket: the membership card, news, events and their tickets, notifications, and chat. Part 1 is the **member's** app. Staff keep working in the web admin area.

**Exit criteria**

- **The app signs in against the same server and the same accounts** as the site, and a session ended on one (sign out everywhere, a disabled account) ends on the other. Tested.
- **The refresh token never leaves the phone's secure storage,** is never written to a log, and a stolen copy used after its owner's is caught as on the web. Tested on the server.
- **The web sign-in is unchanged:** its suites pass as they are.
- **Every screen works in Hebrew (right to left) and English,** with no text written into the code.
- **Every screen passes the phone's accessibility basics:** each control has a name for a screen reader, text follows the phone's text-size setting, and touch targets are at least 44 points.
- **No patient information, fictional people only,** as everywhere.
- The standing ones: CI green (the app's own checks join CI), `PROJECT_STATUS.md` updated, a demo on a real phone.

## 3. Scope

**In part 1 (M14)**

1. **The app's frame:** `apps/mobile`, an Expo (React Native) app in TypeScript, in the same repository, using the shared packages. Bottom tabs: Home, News, Events, Chat, Me.
2. **Sign-in:** email and password, then the authenticator code where the account has one. "Forgot password" and "Join" open the website. Sign out, and "sign out everywhere".
3. **Unlocking with face or fingerprint** (question 4): after the first sign-in the app can ask for the phone's own face or fingerprint check each time it is opened. This is the phone's lock, not a passkey.
4. **Home:** what the member's home page on the site shows (membership state, next events, unread notices).
5. **Membership card:** the digital card with its code, readable without a connection once it has been opened (the last card is kept on the phone, with the date it was fetched).
6. **News:** the list, an item, its picture and files. Member-only items as on the site.
7. **Events:** the list, an event with its programme, register and cancel, "my events", and the ticket code for the door.
8. **Notifications:** the list under a bell, read and "read all", and the switches per kind (the same ones as the site).
9. **Chat:** private conversations, groups and rooms, as on the site: read and write, reply, reactions, mentions, forward, delete, report, block, invitations, files (pictures from the camera roll or the camera, PDF, video), live updates. Moderation tools for a room's moderators. **Not in the app:** the staff's reports screen and room management.
10. **Me:** profile (view; editing opens the site), language, chat settings, notification switches, the accessibility statement, and the app's version.
11. **The server side of sign-in for apps** (§1, item 1), with its tests.
12. **Push notifications** only if question 3 is answered (b).

**Not in part 1, and where it goes**

| Item                                                     | Where                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| The admin area                                           | Stays on the web. Not planned for the app                             |
| Joining (the application form with documents)            | The app opens the site. Part 2 if wanted                              |
| Education library, courses, exam questions               | Part 2                                                                |
| Guidelines, the member directory, site search            | Part 2                                                                |
| Passkeys in the app                                      | When the site has real hosting and an address (§1, item 3)            |
| Publishing in the App Store and Google Play              | After the readiness checklist in `DEPLOYMENT.md` (legal review first) |
| Scanning tickets at the door (staff)                     | Part 2; today it is a web page that works in a phone's browser        |
| Working without a connection, beyond the membership card | Not planned                                                           |
| Tablets as their own layout                              | Not planned; the phone layout stretches                               |

## 4. Rules (proposed; approved with the plan unless a question in §9 changes them)

- **One source of truth.** The app has no data of its own. It shows what the API answers, and the API decides who may see and do what, exactly as for the site.
- **Sign-in for apps is a separate, named path.** The app says it is an app when it signs in. Only then is the refresh token put in the answer; the site's cookie path is untouched. A session started by an app is marked as such, shows in "my sessions" as a phone, and can be ended from the site.
- **The refresh token lives only in the phone's secure storage.** The short-lived access token lives in memory. Nothing of either is logged or sent anywhere but the API.
- **Refreshing works as on the web:** each refresh replaces the token; an old one used again ends the session; the 10-second allowance for a lost answer (M11) applies.
- **The app talks to one server address,** set when the app is built. In the demo that is this computer on your Wi-Fi.
- **Files are picked, never read in bulk.** The app asks for the photo library or the camera only when a member presses "attach", and only for what they pick.
- **The same standing notes as the site** in chat: no patient details, no pictures of patients, and what a video carries.
- **A screenshot or the app switcher can show a message.** The app does not try to block this; it is said in the known limitations.
- **Language:** the app starts in the phone's language when that is Hebrew or English, otherwise Hebrew. Changing it in the app restarts the app if the direction changes.

## 5. Server changes (small, and only additions)

- **`POST /auth/login`, the passkey-free second step, and `POST /auth/refresh`** accept a field that says "native app". For a native app: the refresh token is in the answer's body, no cookie is set, and the refresh route takes the token from the body and needs no CSRF header (that header protects cookies, and there is none). `POST /auth/logout` likewise.
- **`sessions`** gains what kind of client started it (web or app) and a device name the app sends (for example "iPhone of Noa"), shown in "my sessions".
- **Rate limits and lockout** apply as they are.
- If push is in (question 3 (b)): a `push_devices` table (person, token, platform, last seen), `POST` and `DELETE /me/push-devices`, an Expo push adapter behind `PushProvider`, and a "push" column beside "email" and "in the app" in the notification switches.
- The API document and the typed client are regenerated; nothing existing changes shape.

## 6. New libraries and tools (each needs your approval; this is the list)

A phone app can't be built without new libraries. Approving the plan approves these, and nothing else is added without asking:

| What                                         | Why                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `expo`, `react-native`, `expo-router`        | The app itself, and moving between its screens                                       |
| `expo-secure-store`                          | The phone's secure storage, for the refresh token                                    |
| `expo-local-authentication`                  | Face or fingerprint unlock (question 4)                                              |
| `expo-localization`, `use-intl`              | The phone's language; and reading the texts the site already has, in the same format |
| `expo-image-picker`, `expo-document-picker`  | Choosing a picture, a video or a PDF to send in chat                                 |
| `expo-video`, `expo-image`                   | Playing a video and showing pictures                                                 |
| `react-native-svg` with a QR drawer          | The membership card's and the ticket's codes                                         |
| `expo-notifications`                         | Only with push (question 3 (b))                                                      |
| `jest-expo`, `@testing-library/react-native` | The app's tests                                                                      |
| On your phone: the **Expo Go** app           | To see the app during development (question 2)                                       |
| On this computer (only with question 2 (b))  | Android Studio and its emulator, about 10 GB                                         |

Exact versions are pinned in the first checkpoint and listed in `PROJECT_STATUS.md`.

## 7. Tests

- **Server (integration):** sign-in as an app returns the refresh token in the body and sets no cookie; sign-in as the web still sets the cookie and returns none; refresh from the body without a CSRF header works only for a session an app started, and a web session's token is refused there; reuse of an old token ends the session; the lost-answer allowance; ending the session from the site stops the app; the session list shows the device. **The existing sign-in suites pass unchanged.**
- **App (unit and component tests in CI):** the session logic (start, refresh, a refresh that fails, sign out) against a pretend server; that the refresh token is written only to secure storage (checked with a pretend storage that records every write); each screen renders in Hebrew and English with a name on every control; right-to-left layout of the chat bubbles and lists; the chat model functions shared with the web.
- **Texts:** a check that every key the app uses exists in both languages.
- **On a real phone (by hand, a checklist in `docs/demo/`):** sign in, the card, a news item, register for an event, a notice, a chat message arriving live, a picture sent from the camera roll, VoiceOver or TalkBack on the main screens, large text.
- **Automated tests that drive the app on a phone** (tapping through it) need an emulator. They are in only with question 2 (b); otherwise the hand checklist stands in, and that is said plainly in the status.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. This plan, approved.
2. **Server: sign-in for apps,** with its tests. Web suites unchanged.
3. **The app's frame:** the project in `apps/mobile`, shared packages wired in, languages and direction, the tabs, CI checks. **And the two unknowns of §1 tried on your phone:** the live chat connection, and changing language. I report what I find before going on.
4. Sign-in, the session, face or fingerprint unlock, sign out.
5. Home and the membership card.
6. News.
7. Events, registration and tickets.
8. Notifications.
9. Chat: lists, a conversation, a group, a room, live updates.
10. Chat: files, forwarding, invitations, moderation.
11. (Only with question 3 (b)) Push.
12. Accessibility pass; the hand checklist on a phone; documents; `PROJECT_STATUS.md`; demo.

**What existing code is touched:** the auth module (additions); the shared packages if something in them turns out to be browser-only (the chat model, for example, may move from the web app into a shared package so both use it). Nothing in the web app's behaviour changes.

Git: branch `feat/mobile-app` from `main`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to). Because the milestone is long, I propose **two pull requests**: the server change with the app's frame and sign-in (checkpoints 2 to 4), then the screens (5 to 12).

## 9. Questions for the owner

Each has a recommended answer. Answers are recorded in §11.

1. **What is the app for, now?**
   - **(a) Recommended:** a demo app, shown on your own phone at the pitch, working against this computer. Not published. Publishing waits for the readiness checklist.
   - (b) Aim at publishing in the stores. That needs, before anything else: paid Apple and Google developer accounts in the association's name, real hosting with an address, and the legal review. I can prepare the app for it, and can't do those steps for you.
2. **How will you see the app while it is built?**
   - **(a) Recommended:** the free Expo Go app on your own phone, on the same Wi-Fi as this computer. Nothing large to install. Tell me whether your phone is an iPhone or Android (or both).
   - (b) Also an Android emulator on this computer (Android Studio, about 10 GB). It lets me run automated tests that tap through the app, and lets you see it without a phone.
3. **Push notifications**
   - **(a) Recommended:** not in part 1. Since 2025 push does not work inside Expo Go; it needs the app built through Expo's cloud service with an Expo account, and for iPhone a paid Apple account. The bell inside the app works without any of that.
   - (b) In part 1, for Android only, with a free Expo account that you create.
4. **Opening the app**
   - **(a) Recommended:** after the first sign-in, the phone's face or fingerprint check each time the app is opened, with a switch to turn it off. Staff accounts don't use the app's admin functions, so no extra rule for them.
   - (b) No lock: whoever holds the unlocked phone is in.
   - (c) Sign in with the password every time.
5. **Which screens first, if time runs short?**
   - **(a) Recommended:** in the order of §8: sign-in, card, news, events, notifications, chat.
   - (b) Chat first, then the rest.
6. **How long may an app stay signed in without being opened?**
   - **(a) Recommended:** as on the web today (the same session lifetime).
   - (b) Longer for the app (for example 90 days), since a phone is personal and has its own lock.

Smaller points I will follow unless you say otherwise:

- **Hebrew first,** as on the site; the app follows the phone's language when it is Hebrew or English.
- **Light appearance only** in part 1 (no dark mode), as on the site.
- **The app's name on the phone:** "IUA Connect", with the same mark as the site's header, and the demo banner ("all people and data shown are fictional") on every screen.
- **Portrait only.**

## 10. Risks

| Risk                                                       | What is done about it                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A refresh token outside a cookie is easier to mishandle    | A separate named path; secure storage only; a test that fails if it is written anywhere else; reuse detection |
| The live chat connection doesn't work on a phone           | Tried in checkpoint 3, before any chat screen; the fallback is asking every few seconds                       |
| Right-to-left on phones                                    | Tried in checkpoint 3; a restart on change of direction is accepted                                           |
| The milestone is the largest so far (a second application) | Twelve checkpoints; two pull requests; education, directory and joining are kept for part 2                   |
| Two front ends drift apart                                 | One API, one set of texts, one set of tokens; shared model code moves to a package instead of being copied    |
| Nobody can test iPhone and Android both                    | Said plainly in the status: what was tried on which phone                                                     |
| A phone is lost                                            | Face or fingerprint lock; "sign out everywhere" from the site; sessions listed by device                      |
| Photos of patients are one tap away on a phone             | The same standing notes; reports and deletion; **the legal review before real use**, as for files on the web  |
| The demo server is this computer                           | The app works only on the same Wi-Fi; said in the demo script                                                 |
| New libraries bring advisories                             | The dependency scan in CI covers the app too; anything it reports is brought to you, not hidden               |

## 11. Owner answers

Given on 2026-10-05: "1. demo app on my phone 2. Make it compatible for android 16 3. no 4. yes 5. As recommended 6. As the web". With all six answered, the plan is approved, including the list of libraries in §6.

1. **A demo app on the owner's own phone.** Not published.
2. **The owner's phone runs Android 16,** and the app must work on it. Taken as answer (a): the app is seen through Expo Go on that phone, on the same Wi-Fi as this computer; no emulator is installed. **This is Claude's reading of the answer;** if an emulator on this computer was meant as well, the owner says so. The Expo version is chosen in checkpoint 3 so that it supports Android 16, and that is checked on the phone before any screen is built. Nobody will have tried the app on an iPhone.
3. **No push notifications** in part 1.
4. **Face or fingerprint** each time the app is opened, with a switch to turn it off.
5. **The order of §8:** sign-in, card, news, events, notifications, chat.
6. **Signed in as long as on the web.**

The smaller points stand as proposed.

## 12. Amendment 1: the phone reaches this computer through a tunnel

Asked for by the owner on 2026-10-05 ("make a tunnel"), after the phone could not be shown to reach this computer over the Wi-Fi. The choice of program and the details below are Claude's; the owner can change them.

- **What changes.** The server and the app's own server stay on this computer. A tunnel program gives each a public `https://` address, and the phone uses those addresses instead of the Wi-Fi address. The phone no longer has to be on the same Wi-Fi. It works only while this computer is on and the tunnel is running.
- **The program.** Microsoft's dev tunnels (`devtunnel.exe`), signed by Microsoft, kept outside the repository in `%LOCALAPPDATA%\IUAConnectTools`. It is signed in with the owner's GitHub account, by the owner, in the browser. Using it means accepting Microsoft's terms for dev tunnels. Nothing is added to the project's libraries.
- **What is opened.** The server (port 4000) and the app's own server (port 8081). The site (port 3001) is not opened in this step.
- **What it means for safety.** While the tunnel runs, anyone who has the address can reach the demo server from the internet and sign in with a demo account. The address is long and not listed anywhere, the repository with the demo password is private, and the server holds fictional people only. The tunnel is stopped when the demo is not being shown. This is never how real members' data would be served.
- **What does not change.** No code of the server. The app's code changes only in where its `.env` points, which is not committed.
- **Replaces** the risk line "The demo server is this computer: the app works only on the same Wi-Fi".

## 13. What came after

On 2026-10-05 the owner asked for everything the site shows to be in the app. That is its own plan: [`M15-mobile-app-everything.md`](M15-mobile-app-everything.md), proposed and waiting for approval. Part 1 stays as described here, with one change the owner asked for on the same day: the membership card is not a tab, it opens from "Me" and from Home.
