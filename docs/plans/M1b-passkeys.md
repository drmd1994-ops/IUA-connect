# M1b — Passkeys: plan

- Status: **Approved by the owner 2026-09-29; implemented** on branch `feat/auth-passkeys` (pull request #2). Decisions in §10; notes in `PROJECT_STATUS.md` (M1b section).
- Date: 2026-09-29
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M1b ("WebAuthn registration and login — works in Chrome and Edge on Windows"). Builds on M1 (`docs/plans/M1-identity.md`); design sources: `SECURITY_MODEL.md` §3 ("Passkeys in M1b"), `DATABASE_DESIGN.md` §3 (`mfa_factors` already has a WEBAUTHN type and a public-key column), ADR 0002.

## 1. Goal and exit criteria

A member or administrator can add a **passkey** — Windows Hello (face, fingerprint or PIN), a phone, or a security key — and use it to sign in, in Hebrew and English.

**Exit criteria (roadmap):** passkey registration and sign-in work in **Chrome and Edge on Windows**. Plus the standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. What a passkey is, briefly

A passkey is a key pair created by the device. The private key never leaves it; the server stores only the public key. Signing in means the device proves it holds the private key, after the person unlocks it (fingerprint, face or PIN). It can't be phished (it only works on the real site), there's nothing to leak from the database, and nothing to type.

## 3. Scope

**In M1b**

1. **Add a passkey** from Account security (needs a recent sign-in or re-authentication, like other security changes). Name it ("Work laptop"), see the list, rename, remove.
2. **Sign in with a passkey** from the sign-in page: a "Sign in with a passkey" button, plus the browser's passkey suggestions in the email field (autofill) where supported.
3. Passkeys and the authenticator app (TOTP) work **side by side**; a user can have both.
4. Audit entries, new-device email and rate limits, as for other sign-ins.
5. Tests, including browser tests with a **virtual authenticator** in Chromium and Edge.

**Not in M1b**

| Item                                            | Where                                      |
| ----------------------------------------------- | ------------------------------------------ |
| Accounts with no password at all (passkey-only) | Later, if wanted — needs a recovery design |
| Passkeys in the mobile app                      | With the Expo app (after M8)               |
| Admin view of users' passkeys                   | M8 (admin portal)                          |
| Hardware-key-only policies for administrators   | Later, if the IUA asks for it              |

## 4. Decisions

Items marked **(owner)** are the questions in §10; the rest follow from the approved design and M1.

- **Library:** `@simplewebauthn/server` 14.0.2 (API) and `@simplewebauthn/browser` 14.0.0 (web) — the widely used, maintained WebAuthn implementation; both older than the 7-day rule, both ship CommonJS (no test workarounds).
- **Relying party:** ID `localhost` and origin `http://localhost:3001` in development, from new settings `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` (defaults derived from `APP_BASE_URL`). In production they must match the real domain; the API refuses to start with `localhost` in production.
- **User verification required** on every passkey ceremony (the device must check fingerprint, face or PIN, not just presence). This is what makes a passkey count as two factors.
- **Challenges:** random, single-use, 5-minute server-side challenges (stored as keyed hashes, like M1's other tokens); a replayed or expired ceremony is refused.
- **Stored per passkey** (in `mfa_factors`, type WEBAUTHN, plus new columns): credential ID (unique), public key, signature counter, transports, whether it is synced ("backed up"), a user-chosen name, created / last-used times. **Counter check:** a counter that goes backwards on a device that reports counters is refused and audited (cloned-key signal).
- **Discoverable credentials** ("resident keys") so sign-in can start without typing an email.
- **Sessions:** a passkey sign-in creates a normal session with the same lifetimes as M1 (members 7 d / 3 d idle, admin roles 4 h / 15 min idle).
- **Removing the last factor:** a user whose role requires MFA can't remove their last passkey unless an authenticator app is also enrolled (same rule as M1's "can't turn MFA off").
- **(owner)** Passwordless sign-in, admin MFA, synced passkeys — see §10.

## 5. Database (one migration)

- `mfa_factors`: add `credential_id` (unique, bytes), `sign_count`, `transports`, `backed_up`, `device_type`; `label` becomes the passkey's name.
- `auth_tokens`: two new purposes for WebAuthn registration and sign-in challenges. The sign-in challenge exists before the user is known, so its `user_id` becomes optional (with a check constraint: required for every other purpose).

## 6. API (under `/api/v1`)

| Method | Path                                    | Access                         | Notes                                                  |
| ------ | --------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| POST   | `/auth/passkeys/registration/options`   | @Authenticated, recent re-auth | Creation options for the browser                       |
| POST   | `/auth/passkeys/registration/verify`    | @Authenticated                 | Stores the passkey; returns it                         |
| GET    | `/auth/passkeys`                        | @Authenticated                 | The user's passkeys (name, created, last used, synced) |
| PATCH  | `/auth/passkeys/{id}`                   | @Authenticated                 | Rename                                                 |
| DELETE | `/auth/passkeys/{id}`                   | @Authenticated, recent re-auth | Remove (404 for someone else's)                        |
| POST   | `/auth/passkeys/authentication/options` | @Public, rate-limited          | Challenge for sign-in                                  |
| POST   | `/auth/passkeys/authentication/verify`  | @Public, rate-limited          | Signs in: same response and cookies as `/auth/login`   |

Re-authentication (`POST /auth/reauthenticate`) also accepts a passkey instead of password + code. The OpenAPI document and the typed client are regenerated.

## 7. Web (he/en)

- **Sign-in page:** "Sign in with a passkey" button; passkey suggestions in the email field where the browser supports autofill; clear messages when the person cancels or the device has no passkey.
- **Account security:** a Passkeys section — add (name it, then the browser prompt), list, rename, remove. The existing two-step verification section says a passkey counts too (if approved in §10).
- Browsers without WebAuthn see the section disabled with an explanation, never a broken button.

## 8. Tests

- **Unit:** options generation (user verification required, relying-party ID, excluded existing credentials), counter-regression rule, challenge expiry and single use.
- **Integration (real PostgreSQL):** full registration and sign-in ceremonies using a software authenticator in the test (real signatures, not mocks); replayed challenge refused; wrong origin / relying party refused; someone else's passkey can't be renamed or removed; last-factor rule for admin roles; audit entries; rate limits.
- **End to end (Playwright):** Chromium's built-in **virtual authenticator** (DevTools protocol) adds a passkey on Account security, signs out, signs in with it — in **Chromium and Microsoft Edge** locally, Chromium in CI; axe checks on the changed pages in he and en.
- **Manual (owner, at the demo):** the same on your Windows machine with a real **Windows Hello** prompt in Chrome and in Edge — the roadmap's exit check. Automated tests can't press a real fingerprint reader.

## 9. Order of work (a commit at each checkpoint; tests green at each)

1. Schema migration and settings (relying-party ID and origin).
2. Registration ceremony and passkey management API.
3. Sign-in ceremony API; re-authentication with a passkey.
4. Web: Account security passkeys section; sign-in button and autofill.
5. Tests (integration ceremonies, Playwright virtual authenticator), docs, `PROJECT_STATUS.md` (including the pending "M1 merged" correction), demo.

Git: branch `feat/auth-passkeys`, pull request into `main` as in M1 (Claude pushes and opens it; you review, and merge or ask Claude to).

## 10. Owner decisions (2026-09-29)

1. **Passwordless sign-in: yes.** A passkey alone signs someone in, and the session counts as MFA-verified (user verification is required on every ceremony).
2. **Administrators: yes.** A passkey satisfies the mandatory two-step verification for administrative roles; an authenticator app isn't also required.
3. **Passkey types: synced and device-bound.** Windows Hello, iCloud Keychain, Google Password Manager and hardware keys are all accepted (attestation "none").
