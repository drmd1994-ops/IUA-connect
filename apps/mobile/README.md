# IUA Connect for phones

The member's app (plan: `docs/plans/M14-mobile-app.md`). It talks to the same server and uses the same accounts as the site. In the demo it is not published: it is opened on a phone through the free **Expo Go** app.

## See it on your phone (Android)

You need the phone and this computer on **the same Wi-Fi**.

1. **On the phone:** install **Expo Go** from Google Play.
2. **On the computer, find its address on the Wi-Fi.** In PowerShell:

   ```powershell
   ipconfig
   ```

   Look for "IPv4 Address" under the Wi-Fi adapter, for example `192.168.1.20`.

3. **Tell the app where the server is.** Copy `apps/mobile/.env.example` to `apps/mobile/.env` and put that address in both lines.
4. **Start the site and the server** (as for the demo):

   ```powershell
   pnpm dev
   ```

5. **Start the app's own server,** in a second PowerShell window:

   ```powershell
   pnpm --filter @medconnect/mobile start
   ```

   A QR code appears.

6. **On the phone:** open Expo Go and scan the QR code. The app opens.
7. **The first time,** Windows asks whether to let Node.js through the firewall. Allow it for **private networks**. Without this the phone can't reach the computer, and the app says "The server can't be reached".

Sign in with a demo account, for example `member.full@demo.test` and the demo password from the main `README.md`.

## If the phone can't reach the computer: the tunnel

On the owner's computer the phone never loaded the app over the Wi-Fi. A tunnel gives the server and the app's own server public `https://` addresses instead; the phone can then be on any network. **While it runs, anyone who has the address can reach the demo server,** so stop it when the demo is over.

The program is Microsoft's dev tunnels (`devtunnel.exe`, kept in `%LOCALAPPDATA%\IUAConnectTools`, signed in once with `devtunnel user login -g`).

1. Start the site and the server (`pnpm dev`).
2. Open the tunnel, and leave its window open:

   ```powershell
   & "$env:LOCALAPPDATA\IUAConnectTools\devtunnel.exe" host -p 4000 -p 8081 --allow-anonymous
   ```

   It prints two addresses, one ending in `-4000…` (the server) and one in `-8081…` (the app's own server). They change each time.

3. Put the first in `apps/mobile/.env` as `EXPO_PUBLIC_API_URL`, with `EXPO_PUBLIC_USE_RN_FETCH=1` (see `.env.example`: without it, sending a file from the phone fails).
4. Start the app's own server with the second, in `cmd`:

   ```
   set EXPO_PACKAGER_PROXY_URL=https://<the address ending in -8081…>
   pnpm --filter @medconnect/mobile start
   ```

5. In Expo Go choose "Enter URL manually" and type `exps://<the address ending in -8081…>` without `https://`, or scan the QR code.

The site is not behind the tunnel, so the card's code can't be checked from a second device this way.

### A fixed address, and an .apk

The tunnel above gets a new address each time. The demo also has a **named tunnel whose address stays the same**; start it by double-clicking `%LOCALAPPDATA%IUAConnectToolsstart-tunnel.cmd` and leave its window open. It lives as long as it is used at least once in thirty days.

An **.apk** (the app as a file that installs on an Android phone, without Expo Go) is built on GitHub by the workflow "Demo APK": push a branch named `apk/...`, or start the workflow from the Actions page, and download `iua-connect-demo-apk` from the finished run. The server's address is built into the .apk from the repository variables `DEMO_API_URL` and `DEMO_WEB_URL`, so the .apk works only while this computer, `pnpm dev` and the fixed tunnel are running. It is signed with a debug key: it installs on a phone, and can't go to an app store.

## What to try in this first step

- **Sign in,** close the app completely, and open it again: you should still be signed in, after the phone's fingerprint or face check.
- **Change the language** to English and back. The text changes at once; the direction of the page changes after the app is closed and opened again.
- **"Me" → "My membership card":** your membership card with its code. On a second device, scan the code: the site's verification page should say the membership is valid. Then switch the phone to flight mode and open the tab again: the card is shown as it last was, with its date and without a code.
- **The "News" tab:** the list; choose a category; "Show more" at the end; open an item with a picture; open one of its files (it opens in the phone's browser); the back link returns to the list. In Hebrew and in English.
- **The "Events" tab:** upcoming and past; open "Workshop with limited places (demo)" or another event; "Register", then tick sessions and "Save my schedule"; "View my schedule"; "Cancel my registration". On the site, as the same person, the registration shows too.
- **Home → "Open notifications",** and "Me" → "Notification settings".
- **The "Chat" tab,** with a second person signed in on the site: write both ways, send a picture, make a group, join a room.

The full list, to go through line by line, is `docs/demo/MOBILE_CHECKLIST.md`.

- **"Me" → "Connection check" → "Start the check".** It says whether live updates (which chat uses) arrive on your phone. It can take up to thirty seconds. Tell Claude what it says, including the "details for the developer" line.
- **On the site,** as the same person: **Account → Security**. The phone is listed among your sessions, by its name. Ending it there signs the app out.

## If something goes wrong

| What you see                               | What to do                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| "The server can't be reached"              | Same Wi-Fi? Is `pnpm dev` running? Is the address in `.env` this computer's? Firewall allowed? |
| Expo Go says the project is not compatible | Update Expo Go from Google Play. The app is built for Expo SDK 57.                             |
| The QR code doesn't open anything          | In Expo Go choose "Scan QR code", not the phone's camera app.                                  |
| The address of the computer changed        | Routers hand out addresses anew now and then. Run `ipconfig` again and correct `.env`.         |
| A change in `.env` has no effect           | Stop the app's server (Ctrl+C) and start it again.                                             |

## For developers

- `pnpm --filter @medconnect/mobile typecheck`, `lint`, `test`. `test` runs two kinds, neither needing a phone: `test:rules` (vitest, `*.test.ts`: the session, the starting language, the lock, and what each screen decides) and `test:screens` (jest, `*.test.tsx`: every screen drawn in both languages, and five flows in depth).
- **A new screen** is added to the list in `src/all-screens.test.tsx`, and what it asks the server to `src/testing/fixtures.ts`. The test then fails for a missing text, a control without a name, or a request without an answer.
- The refresh token is kept only in the phone's secure storage (`src/session/`). Nothing else may store it; a test fails if it is written anywhere else.
- Texts come from `packages/i18n` (the group `mobile` holds what only the app shows). No text is written into the code.
- Colours and sizes come from `packages/ui-tokens`.
- The chat rules both front ends share come from `@medconnect/api-client/chat`; what only the app decides is in `src/chat/model.ts`.
- One stream of live chat events serves the whole app (`src/chat/events.tsx`); it closes when the app goes to the background.
- Passkeys don't work in the app: they need a site with real hosting and its own address.
