# M37: The app on an iPhone, starting with the simulator

**Status: approved by the owner on 2026-11-10 with the answers in §10.**

Track: Operate. Size: M. Needs first: M14, M15, M18b (the app as it is on Android).

## 0. What I checked on 2026-11-10

- **The project has a Mac now** (macOS 26.6, Apple silicon) with **Xcode 26.6**. Every earlier plan said "no Mac, no Apple account, so Android only" (M14 §1, M18b §2, M21 §5).
- **No iOS simulator is installed** (`xcrun simctl list runtimes` is empty) and **CocoaPods is missing**, which Expo needs to build for iOS.
- **The app already lists iOS** in `apps/mobile/app.json` (`platforms`, `ios.bundleIdentifier: test.demo.medconnect`, the Face ID, camera and photos texts). The screens and the rules are shared; `apps/mobile/ios/` is made by Expo on each build and ignored by git, as `android/` is.
- **What is Android only today:**
  - `plugins/with-secure-screen.js`: Android's block on screenshots and the recent-apps preview (owner's decision, 2026-10-28).
  - `plugins/with-app-links.js`: links in emails that open the app.
  - `plugins/with-release-signing.js`: the .apk's signing key.
  - Passkeys in the app (M18b) depend on the site naming the Android app; an iPhone needs the same through Apple, which needs a paid account.
- **Files from an iPhone:** chat accepts JPEG, PNG, PDF and MP4 only (`apps/api/src/modules/files/file-processing.ts`). An iPhone records video as `.mov` and takes pictures as HEIC. The app sends what the picker gives it (`apps/mobile/src/chat/message.tsx`), so a video from an iPhone is probably refused today. Not tried yet.
- **The owner has an iPhone.**

## 1. Goal

The app works on an iPhone as it does on Android: first in the simulator on this Mac, then on the owner's iPhone, installed from Xcode with a free Apple ID. **Level 1 only** (owner's answer, 2026-11-10): no paid Apple account, no TestFlight, no App Store.

## 2. Scope

**In**

1. **The tools on this Mac:** an iOS simulator from Xcode, and CocoaPods (§5).
2. **A simulator build** that talks to the server on this Mac (`pnpm dev`), and the fixes it shows: layout, Hebrew right to left, the keyboard, safe areas, fonts.
3. **Files from an iPhone:** pictures arrive as JPEG, and **the app converts videos to MP4 before sending** (owner's answer, §10); the server is unchanged. First the picker's own "most compatible" setting; if it still hands over a `.mov`, the app's own module (§5) converts it with Apple's built-in video export. With tests.
4. **What a free Apple ID allows:**
   - Push permission is not asked for. `expo-notifications` adds Apple's push setting by default, and a free account refuses to install an app that has it. Reminders scheduled on the phone (M32) don't need it and stay.
   - Passkeys are hidden in the app on an iPhone, with the same note as before M18b: "Passkeys don't work in the app yet". The site's passkeys are unchanged.
   - Links in emails keep opening the browser on an iPhone.
5. **Screen privacy on an iPhone: screenshots blocked** (owner's answer, §10). Apple offers no way to block a screenshot, so it is done in two layers:
   - **The block:** the app's window is drawn inside the layer iOS uses for password fields, which screenshots and screen recordings leave out. A screenshot of the app then shows a blank screen. This is not an Apple feature but a known technique that banking apps use. An iOS update could stop it from working without warning, so it is tested on each new iOS version.
   - **The fallback, with Apple's own features:** while the screen is recorded or mirrored, the app covers itself; in the recent-apps view it shows a cover; after a screenshot (which iOS reports only once it is taken) the app says that screenshots of the app are not allowed.
   - As on Android, nothing stops a photo of the screen taken with another phone.
6. **The owner's iPhone:** a build installed from Xcode by cable, pointed at the hosted demo, so it works without this Mac running. Then `docs/demo/MOBILE_CHECKLIST.md` on the iPhone.
7. **Docs:** the iPhone steps in `apps/mobile/README.md`; `KNOWN_LIMITATIONS.md` and `PROJECT_STATUS.md` say what was tried on which phone.

**Not in**

| Item                                             | Why                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| TestFlight, other people's iPhones               | Level 2, needs a paid Apple account ($99 a year)                           |
| Passkeys and email links in the app on an iPhone | Need a paid account (Apple's associated domains)                           |
| Push notifications                               | M21                                                                        |
| The App Store                                    | M21, after the legal review                                                |
| An iPhone build in CI                            | Needs a paid macOS runner or Expo's cloud; the builds are made on this Mac |

## 3. Rules

- **Android doesn't change.** Every change for the iPhone is checked against the Android tests and a new .apk.
- **No secrets in the repository.** The free Apple ID signs on this Mac only; nothing about it is committed.
- **Fictional people only,** as always: the simulator and the iPhone use the demo accounts.
- **No new texts without Hebrew and English.**

## 4. What is built

| Where         | What                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App           | A config plugin that leaves out the push setting on iOS; passkeys hidden on iOS; the screenshot block with its fallback (§2, item 5); whatever the simulator shows needs fixing               |
| App or server | Video from an iPhone (§9, question 2); pictures checked to arrive as JPEG                                                                                                                     |
| Docs          | `apps/mobile/README.md` (simulator, iPhone by cable, the 7-day limit), `KNOWN_LIMITATIONS.md`, `PROJECT_STATUS.md`; the macOS setup in the main README follows separately, as the owner asked |

## 5. New tools, libraries and costs (each needs the owner's approval)

- **An iOS simulator** for Xcode 26.6 (`xcodebuild -downloadPlatform iOS`, a download of about 8 GB from Apple). On this Mac only.
- **CocoaPods** (`brew install cocoapods`). On this Mac only; Expo uses it to build for iOS.
- **The screenshot block** (and the video conversion, if needed) is native iOS code in **a small module of our own** in `apps/mobile/modules/` (Expo's local modules, no outside code; owner's answer, §10). It uses only Apple's own frameworks.
- **No new library in the app.**
- **A free Apple ID** in Xcode for the iPhone step. No cost.

## 6. Tests

- App: the existing tests stay green; new component tests for what differs on iOS (passkeys hidden, the cover).
- Server: if `.mov` is accepted, tests that a real `.mov` passes the content check and anything else claiming to be one is refused.
- In the simulator: sign in, the tabs, Hebrew and English, chat with a picture from the simulator's photos.
- On the owner's iPhone (the real test): `MOBILE_CHECKLIST.md`, plus a picture and a video from the camera roll, Face ID, and a reminder on a locked phone.

## 7. Order of work (a commit at each step; tests green at each)

1. The tools: the simulator and CocoaPods.
2. The first simulator build, against `pnpm dev`; a list of what is wrong.
3. The fixes from the list, Hebrew and English.
4. The free-account changes: no push setting, passkeys hidden. The screenshot block and its fallback; whether the block holds is checked on the iPhone in step 6 (the simulator's own screenshots bypass it).
5. Files from an iPhone.
6. A build on the owner's iPhone, pointed at the hosted demo; the checklist.
7. Docs, `PROJECT_STATUS.md`, the demo.

## 8. Risks

- **An app installed with a free Apple ID stops opening after 7 days.** Xcode installs it again in a minute; the steps say how. That is why the iPhone build points at the hosted demo: no Mac needed in between.
- **The simulator is not a phone:** it has no camera and no Face ID prompt the way a phone has, and it runs at the Mac's speed. The iPhone step is the real test.
- **The 30 November conference:** level 1 puts the app on the owner's iPhone only. Other iPhones in the rehearsal use the site, as M32 planned.
- **Something in Expo 57 or a library may not build for iOS 26** without changes. The first simulator build (step 2) will show it early.

## 9. Questions for the owner

1. ~~The tools~~ Answered: yes.
2. ~~Video from an iPhone~~ Answered: the app converts it to MP4.
3. ~~Screen privacy~~ Answered: screenshots blocked, with a small module of our own.
4. **Approval of this plan.**
5. ~~Should the app be on your iPhone before the 30 November conference?~~ Answered: yes (§10).

## 10. Owner answers

Answered so far on 2026-11-10:

- **Level 1:** the simulator and the owner's iPhone with a free Apple ID; no paid account.
- **The owner has an iPhone,** and the work starts with the simulator on this Mac.
- **Before the 30 November conference:** yes. Steps 1 to 6 come first, the docs after.
- **Screenshots are blocked on the iPhone too,** as on Android (§2, item 5), with **a small module of our own**, not a library.
- **The tools:** the iOS simulator and CocoaPods may be installed on this Mac.
- **Video from an iPhone:** the app converts it to MP4 before sending; the server is unchanged.
