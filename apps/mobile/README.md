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
   pnpm --filter @iua/mobile start
   ```

   A QR code appears.

6. **On the phone:** open Expo Go and scan the QR code. The app opens.
7. **The first time,** Windows asks whether to let Node.js through the firewall. Allow it for **private networks**. Without this the phone can't reach the computer, and the app says "The server can't be reached".

Sign in with a demo account, for example `member.full@demo.test` and the demo password from the main `README.md`.

## What to try in this first step

- **Sign in,** close the app completely, and open it again: you should still be signed in, after the phone's fingerprint or face check.
- **Change the language** to English and back. The text changes at once; the direction of the page changes after the app is closed and opened again.
- **The "Card" tab:** your membership card with its code. On a second device, scan the code: the site's verification page should say the membership is valid. Then switch the phone to flight mode and open the tab again: the card is shown as it last was, with its date and without a code.
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

- `pnpm --filter @iua/mobile typecheck`, `lint`, `test` (the tests cover the app's rules: the session, the starting language, the lock; they need no phone).
- The refresh token is kept only in the phone's secure storage (`src/session/`). Nothing else may store it; a test fails if it is written anywhere else.
- Texts come from `packages/i18n` (the group `mobile` holds what only the app shows). No text is written into the code.
- Colours and sizes come from `packages/ui-tokens`.
- Passkeys don't work in the app: they need a site with real hosting and its own address.
