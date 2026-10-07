# M19: The app in the stores, push notifications, and limited offline use

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Operate. Size: L. Needs first: M18 for publishing (the stores ask for a privacy policy and a real service). Push and offline can be built before it.

## 1. Goal

Members install IUA Connect from Google Play and the App Store, get notifications on the phone, and can read what they saved without a connection.

**Why:** The app exists only as a demo file for Android. The roadmap put the app after the readiness gate; the specification (§56) asks for limited offline use.

## 2. Scope

**In**

- An iPhone build, tested on a real iPhone; store listings in Hebrew and English; signing keys kept safely.
- Push notifications: a phone registers, the server sends through the push connection point that exists since M10, a "push" switch per kind beside "email" and "in the app".
- What a push may say: never the content of a private message, only that there is one.
- Offline, as the specification lists: saved articles and guidelines, downloaded education files, the conference schedule; shown with the date they were saved.
- An update prompt when the app is too old for the server.

**Not in**

- The admin area in the app (the owner decided it stays on the site).
- Tablets as their own layout.

## 3. Rules

- A push token is personal data: kept per device, deleted on sign-out, never logged.
- Nothing members-only is kept on the phone unencrypted after sign-out.
- Offline content is read-only; nothing is written while offline.

## 4. What is built

**Data:** `push_devices` (person, token, platform, last seen). Preferences gain a push column.

- Server: device registration, the push adapter (Expo's service or the stores' own), sending in the notifications job.
- App: permissions, registration, opening the right screen from a notification; a small local store for saved items.
- Site: the push column in notification settings.

## 5. New libraries, services and costs (each needs the owner's approval)

- `expo-notifications`; a local database library for offline (`expo-sqlite`).
- An Apple developer account ($99 a year) and a Google Play account ($25 once), in the association's name.
- A build service for iPhone (Expo's cloud build, free tier or paid) since this project has no Mac.

## 6. Tests

- Server: registration, sending, a revoked token, the "never the content" rule.
- App: screen tests for the new screens; the checklist on an iPhone and an Android phone.

## 7. Order of work (a commit at each step; tests green at each)

1. This plan approved; the store accounts opened by the association.
2. Push: server, then app, on Android.
3. Offline reading.
4. The iPhone build; fixes for what differs there.
5. Store listings, the stores' reviews, release.

## 8. Risks

| Risk                                         | What is done about it                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Apple's review rejects the app               | Their guidelines are read at checkpoint 1; medical apps get extra questions, answered in the listing |
| Nobody on the project has an iPhone or a Mac | A cloud build and a borrowed iPhone; said plainly in the status if it was not tried                  |

## 9. Questions for the owner

1. In whose name are the store accounts?
2. Which push service: Expo's (simplest) or the stores' own (no third party)?
3. Is an iPhone available for testing?

## 10. Owner answers

None yet.
