# IUA Connect — Project Status

_Last updated: 2026-09-30_

## Summary

| Item                      | Status                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                     | **M2 People & membership: merged 2026-09-30** (pull request #4). M1b Passkeys merged 2026-09-29 (PR #2; the manual Windows Hello check is deferred by the owner until the mobile app exists). M1 Identity merged (PR #1). M0 Foundations complete. Next: the M3 plan, for the owner's approval. |
| Mode                      | **Demo / pitch.** A private application to be pitched to the Israeli Urological Association (IUA). Not endorsed by or affiliated with IUA or the Israeli Medical Association (IMA).                                  |
| Repository                | Git repository initialized in `C:\Users\PC\Desktop\IUA CONNECT` (branch `main`, remote `origin` → `https://github.com/drmd1994-ops/IUA-connect.git`, not pushed; the owner pushes). |
| Existing code to preserve | None                                                                                                                                                                                                                 |
| Team                      | 1 developer now; planned 2–3                                                                                                                                                                                         |
| Dev environment           | Windows, native (no Docker). PostgreSQL 16.10, portable install (`C:\Users\PC\tools\pgsql`, data `C:\Users\PC\pgdata`, started with `pg_ctl`, not a Windows service). Node 24.21.0 LTS, portable (`C:\Users\PC\tools\node-v24.21.0-win-x64`, on the user PATH), with pnpm 10.34.5. Node 22.23 remains on disk but is no longer on PATH. |

## Repository inspection (spec §61 steps 1–2)

- Files found: none.
- Technologies detected: none. Everything in these documents is a proposal for a greenfield project.
- Local tooling observed on the machine (home-folder names only): `.expo` and `.android` folders exist, so Expo / Android tooling has been used before; `pgdata` exists, so PostgreSQL runs locally.

## Decisions recorded (2026-09-27)

| #   | Topic                      | Decision                                                                                                                                                                                                                                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Client                     | Private app, pitched to IUA. Demo data only; no real member data before legal review.                                                                                                                                                     |
| D2  | Membership source of truth | IMA. For the MVP, members are managed by hand. No IMA integration yet; the interface is prepared for it.                                                                                                                                  |
| D3  | Verification               | The registrant supplies a **specialist certificate number** (a resident supplies registration details). Their **department director** approves, then an **IUA admin** gives final approval. Directors are created and verified by admins. |
| D4  | Payments                   | Not in the MVP. The schema and `PaymentsModule` interface are prepared for later.                                                                                                                                                         |
| D5  | Clients                    | Responsive **web first** (Next.js). The Expo app follows once the API is stable.                                                                                                                                                          |
| D6  | Languages                  | Hebrew (default, right-to-left) and English at launch. Architecture ready for Arabic and Russian.                                                                                                                                         |
| D7  | Content access             | Access-tier infrastructure is built. All content defaults to **public**; admins can change it per item.                                                                                                                                   |
| D8  | Video hosting              | Only an interface in the MVP. **Ask the owner** at the video milestone.                                                                                                                                                                   |
| D9  | Member directory           | **Opt-in**, hidden by default, with per-field visibility.                                                                                                                                                                                 |
| D10 | Logbook                    | Independent from MedOps Registry, with a documented export format for possible future integration. Separate codebases.                                                                                                                    |
| D11 | Content import             | Curated **sample** from urology.ima.org.il: 10–20 news and event items with source links; guideline and document **metadata plus links** (no copied PDFs). **Physician directory is NOT imported.**                                       |
| D12 | Team readiness             | Monorepo, CI, shared lint and TypeScript config, ADRs, CONTRIBUTING, PR template.                                                                                                                                                         |
| D13 | Auth                       | In-house auth inside the NestJS API using proven libraries, behind an identity-provider interface so an external OIDC provider can replace it later.                                                                                      |
| D14 | Admin portal               | A protected route group inside the web app (MFA required, shorter sessions). Can be split out into its own app later.                                                                                                                     |
| D15 | Infrastructure for demo    | PostgreSQL only. The job queue runs in Postgres (pg-boss). Rate limiting is in memory. File storage uses a local-disk adapter. Redis, S3 and ClamAV plug in later through interfaces.                                                     |

## Open items

| #   | Item                                                                                                                                                                                                                                  | Needed by            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| O1  | ~~Approval of these planning documents~~ **Resolved 2026-09-27:** approved by the owner.                                                                                                                                             | —                    |
| O2  | ~~Git setup~~ **Resolved 2026-09-27:** `git init` done, remote added, pushed to `main` with a personal access token (Git Credential Manager). CI green.                                                                               | —                    |
| O3  | ~~Certificate number format and resident identifiers~~ **Resolved 2026-09-29:** any digits (1–15); residents and non-full members give a medical licence number; students are approved by an IUA admin directly. | —                    |
| O4  | Permission from IUA/IMA before showing imported content in a pitch (recommended)                                                                                                                                                      | Before the pitch     |
| O5  | Video hosting choice                                                                                                                                                                                                                  | Video milestone      |
| O6  | Professional legal review (spec §59)                                                                                                                                                                                                  | Before any real data |

## M0 Foundations (2026-09-27)

### Delivered

- pnpm 10 + Turborepo monorepo: `apps/api`, `apps/web`, `packages/{shared,i18n,ui-tokens,api-client,eslint-config,tsconfig}`, `tools/scripts`.
- **API (NestJS 11):** health endpoints (`/health/live`, `/health/ready`), error envelope, correlation IDs, pino logging with redaction, helmet + CORS, Zod validation, **deny-by-default permission guard** plus the build-failing route-declaration test, typed env config that refuses demo adapters in production, OpenAPI 3.1 export.
- **Database (Prisma 7, PostgreSQL 16):** baseline migration with `citext`, `pg_trgm`, `pgcrypto`, `normalize_he()`, and `audit_logs` (append-only: trigger for every role + app role limited to SELECT/INSERT). Owner and app roles; seed runner with production guard (layers empty until M1/M2/M4).
- **Audit module:** `AuditService` (redacting), `@Audited` decorator and interceptor.
- **Web (Next.js 16):** `/he` (default, RTL) and `/en`, next-intl, Tailwind v4 with design tokens, IBM Plex Sans / Plex Sans Hebrew (self-hosted), nonce-based CSP and security headers, skip link, demo banner and disclaimer, "Coming soon" section cards (not interactive), localized 404.
- **Quality:** ESLint (module boundaries, no hard-coded JSX text), Prettier, Husky + lint-staged + commitlint, gitleaks pre-commit (when installed), `.gitattributes` (LF), `.editorconfig`, `.env.example`.
- **CI:** GitHub Actions lint → typecheck → unit → integration (Postgres 16 service) → security (gitleaks, Semgrep, `pnpm audit`) → build, plus a check that the generated API client is current.
- **Docs:** README with the Windows runbook, CONTRIBUTING, SECURITY, TESTING, DEPLOYMENT, DATABASE.md / API.md / AI.md, ADRs 0001–0007, PR template, CODEOWNERS.

### Verified on the owner's machine (Node 24.21.0)

- `pnpm setup:dev` ran end to end, first with a temporary runtime and again with the installed Node 24 (idempotent re-run): created roles `iua_owner`, `iua_app` and databases `iua_connect`, `iua_connect_test`; migrated both; seeded. Other databases untouched.
- Unit tests: 28 API + 32 package/web tests pass. Integration tests: 22 pass against PostgreSQL.
- Proof of the exit criterion: removing `@Public()` from a real route makes the route-declaration test fail, naming the route.
- Lint, typecheck, format check, full build, `pnpm audit --audit-level=high` (after overriding two transitive Prisma CLI dependencies): all clean. No drift between migrations and the Prisma schema.
- Live smoke test: API health and envelope; web `/` → `/he`, `lang="he" dir="rtl"`, `/en` LTR, 404 page, every script tag carries the CSP nonce.

- CI on GitHub: the first run (`fdc0598`) failed only in the security job (25 Semgrep findings: unpinned actions, missing pnpm/npm supply-chain settings, `shell: true` and a dynamic regex in the setup scripts). Fixed in `e7e5087`; run 36321842174 green on all six jobs.

### Not yet verified

| Item | Why |
| --- | --- |
| Visual check of `/he` and `/en` by Claude | The Chrome extension wasn't connected; checked via HTTP only. The demo was opened in the owner's browser at http://localhost:3001 for review |

### Supply-chain policy (added in `e7e5087`)

- pnpm: `minimumReleaseAge` 7 days, `blockExoticSubdeps`, `trustPolicy: no-downgrade` (one reviewed exception: `semver@6.3.1`). npm: `min-release-age=7`.
- Consequence: newly released versions (including security patches) can't be installed for 7 days. For an urgent patch, add a reviewed entry to `minimumReleaseAgeExclude` or an override in `pnpm-workspace.yaml`, as done for `multer`.
- Peers that pnpm auto-installs (`@types/node`, `prettier`, `vite`) are pinned via overrides; bump them together with the declared versions.

### Notes and deviations

- Versions: NestJS 11 as planned (NestJS 12 is ESM-only and unsupported by `nestjs-zod`), TypeScript 6.0 (TypeScript 7 isn't supported by ts-jest/typescript-eslint yet), Prisma 7.10 (8.x is a release candidate), pnpm 10, ESLint 9.
- Playwright E2E is set up with the first user flows (done in M1), not in M0.
- The web app runs on port **3001** (owner request, 2026-09-27); port 3000 is used by another local app.
- `C:\Users\PC` (the home folder) is itself an empty git repository, created outside this project. It was left untouched; the owner may want to remove `C:\Users\PC\.git`.
- Prettier briefly reformatted the planning documents (whitespace and table padding only; content verified unchanged). They are now excluded from formatting.

## M1 Identity (2026-09-27, merged 2026-09-29)

Plan: [`docs/plans/M1-identity.md`](docs/plans/M1-identity.md), approved by the owner with four decisions (web screens included; bundled breached-password list; shorter sessions: members 7 d / 3 d idle, admins 4 h / 15 min idle; branch + pull request). **Merged** into `main` on 2026-09-29 at the owner's request (pull request #1, squash commit `cd97d49`); CI green on `main` afterwards.

### Delivered

- **Schema:** users, roles, permissions, scoped role grants, devices, sessions, refresh tokens, MFA factors, recovery codes, single-use tokens; role catalogue in `@iua/shared`, seeded idempotently.
- **API:** register, email verification (+ resend), sign-in with lockout and new-device email, MFA sign-in step, refresh with rotation and reuse detection, sign-out, `/me`, re-authentication, TOTP setup/confirm/disable, recovery codes, password change/forgot/reset, sessions list/revoke. Every route declares `@Public()`, `@Authenticated()` (new) or `@RequirePermission()`.
- **Security:** Argon2id; 72 000-entry breached-password list; EdDSA access tokens; keyed-hash storage of tokens and codes; AES-256-GCM for TOTP secrets; rate limits behind `RateLimitStore`; admin permissions only in MFA sessions. See SECURITY.md.
- **Web (he/en):** sign-in (with MFA step), sign-up, verify email, forgot/reset password, account security (MFA with QR and recovery codes, password, sessions); header account menu; `/api/v1` proxied through the web origin.
- **Tooling:** `pnpm admin:create` (development only, fictional domains); console mailer writing to `outbox/`; Playwright + axe; CI e2e job.

### Verified

- API: 80 unit and 66 integration tests (PostgreSQL), including reuse detection, lockout, replay protection and rate limits (TESTING.md lists what each proves).
- Web and packages: unit tests; **32 Playwright tests** locally in Chromium and Microsoft Edge: member journey (Hebrew), password reset (English), administrator MFA enrolment, and **no WCAG 2.2 AA violations (axe) on every auth page in both languages**.
- gitleaks, Semgrep and `pnpm audit` clean in CI.

### Deviations from the plan and findings

- `audit_logs.actor_user_id` has **no foreign key** to `users` (the plan said it would): hard-deleted accounts keep pseudonymous audit rows, and the append-only trigger forbids `ON DELETE SET NULL`.
- **Bug found and fixed:** Prisma's pg adapter stored timestamps shifted by the server's UTC offset. Connections and databases now use UTC; regression tests added. Dev-only audit rows written during M0 are shifted and can't be corrected (append-only).
- **Semgrep finding fixed:** AES-GCM decryption didn't enforce the full 16-byte tag.
- Rate limits are a custom guard over `RateLimitStore` rather than `@nestjs/throttler`: per-account limits needed the request body, and the store interface is the one in ARCHITECTURE §5.
- Sign-in and the MFA code step are one page (`/login`) with two steps, not two routes.
- `pnpm admin:create` accepts only reserved example domains (`example.test` etc.), enforcing "fictional people only".
- Local end-to-end runs share one IP, so the registration limit (5/hour) allows two or three full runs per hour; restarting the API resets it (TESTING.md). Edge skips the account-creating journeys for this reason.
- 17 dependency versions were stepped back to releases at least 7 days old (supply-chain rule); `multer` forced to 2.4.0.

## M1b Passkeys (2026-09-29)

Plan: [`docs/plans/M1b-passkeys.md`](docs/plans/M1b-passkeys.md), approved by the owner with three decisions: a passkey alone signs in (passwordless); a passkey satisfies the MFA requirement of administrative roles; synced and device-bound passkeys are both allowed. **Merged** into `main` on 2026-09-29 at the owner's request (pull request #2).

### Delivered

- **Schema:** passkey fields on `mfa_factors` (credential ID, public key, counter, transports, synced flag); WebAuthn challenge purposes on `auth_tokens` (user optional only for sign-in challenges).
- **API:** `/auth/passkeys` registration (options/verify), list, rename, remove; sign-in (options/verify) with the same session and cookies as password sign-in; re-authentication with a passkey; password sign-in reports `mfaMethods`.
- **Web (he/en):** "Sign in with a passkey" and passkey suggestions in the email field; a Passkeys section on Account security; "Confirm with a passkey" when re-authenticating.
- **Settings:** `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN`, defaulting to the web app's address; production refuses `localhost`.

### Verified

- API: 82 unit and 80 integration tests, including **15 passkey tests with real signatures** from a software authenticator (replay, wrong origin or relying party, missing user verification, counter regression, ownership, admin rules).
- **36 Playwright tests** locally in Chromium and Microsoft Edge, including passkey registration and passwordless sign-in with the browser's virtual authenticator, in English and Hebrew, with axe checks.

### Deviations and notes

- The passkey **challenge** endpoint has only the global rate limit (the sign-in page asks for one on every visit, for autofill); the **verify** step keeps the strict sign-in limit.
- Re-authentication for accounts with passkeys but no authenticator app requires the passkey (the password alone would be weaker than the account's sign-in). Not spelled out in the plan; follows its security intent.
- A temporary password lockout doesn't block passkey sign-in (the lockout protects the password, which isn't used). An administrator-locked or disabled account can't sign in either way.
- Passkey-only accounts have no recovery codes; the Account security page recommends a second passkey or an authenticator app as a backup.

### Open for the owner

- **Manual Windows Hello check — deferred by the owner (2026-09-29)** until the mobile app exists: add a passkey with a real Windows Hello prompt and sign in with it, in Chrome and in Edge. Until then, M1b's exit criterion is met by the automated tests only (virtual authenticator in Chromium and Edge).
## M2 People & membership (2026-09-30)

Plan: [`docs/plans/M2-people-membership.md`](docs/plans/M2-people-membership.md), approved by the owner on 2026-09-29 with these answers:

- **O3:** certificate numbers are any digits; residents give a medical licence number; students are approved by an admin directly.
- **Non-full members** give a medical licence number.
- **Memberships run by calendar year.**
- **The CSV import creates accounts**, with a "set your password" email.
- **The demo seed** has fictional people with one documented password.

Library added with the owner's approval: `uqr` 0.1.3 (QR codes, no dependencies).

### Delivered

- **Institutions:** membership types, 11 subspecialties, 21 hospitals with urology departments (reference seed, insert-only). Admin screens for hospitals, departments and **department directors**. A role's scope must point at a real department (database triggers).
- **Profiles:** every spec §6 field except photo (M3) and publications (Phase 2). Each field has its own visibility (private by default). ORCID is checked with its check digit. A department must belong to its hospital.
- **Application workflow:** member → department director → IUA admin → active membership until 31 December.
  - Students skip the director. Departments without a director are flagged for the admin.
  - Directors see only their own departments, never their own application. A reason is required to reject.
  - One open application per user. Withdraw. Emails at each step (he/en).
- **Identifiers:** certificate and licence numbers are stored encrypted with a keyed hash. One number can't be used twice. The number is never returned, logged or audited.
- **Admin:** approval queue; members list with filters, search and paging; member detail; create by hand (including honorary members); renew, suspend (with reason), reinstate, expire; payment status set by hand. Every change goes into the append-only history and the audit log.
- **Digital card:** a 5-minute signed QR token that names only the membership. The public `/card/verify` page (60 per minute per IP) shows valid/invalid, the name and the type. Suspension or expiry invalidates the card immediately.
- **CSV import:** the dry run reports per row (create account / create membership / update / unchanged / skip, with reasons). Applying needs the same file and runs once. New accounts get a 7-day "set your password" link. Only the report and a keyed hash of the file are stored.
- **Demo seed:** 13 fictional people at `@demo.test` covering every state (see README, "Demo accounts").

### Verified

- API: **117 unit and 124 integration tests.** Every admin route has the anonymous 401 / member 403 / admin-without-MFA 403 / admin 2xx tests.
- Web: 10 unit tests; **62 Playwright tests** in Chromium and Edge, including the **exit test**: register → director approves → admin approves → the card verifies (then suspension invalidates it), with axe WCAG 2.2 AA checks on every page it visits, and all new pages in he and en.

### Deviations and findings

- **OpenAPI types:** a bare `z.string().nullable()` came out as an array type, so the web's generated types were wrong. This also affected M1's session IP field. Fixed with `nullableString()`, plus a test that checks the document and forbids the bare form.
- **Prisma and raw-SQL rules:** Prisma doesn't model the composite foreign keys (a department inside its hospital), so each generated migration tries to drop them. Those lines are removed by hand; a note at the top of the schema explains why.
- **Admin checks in the web app are for display only.** The web server never sees the in-memory access token, so every rule (roles, MFA, department scope) is enforced by the API. This is how ADR 0006 is applied.
- **Password-reset links now also accept the new 7-day account-setup link** from imports. Ordinary reset links still last 1 hour.
- **Emails go to the applicant only.** Directors and admins aren't notified of new applications (in-app notifications are M7).

### Open for the owner

- ~~Merge pull request #4~~ merged at the owner's request on 2026-09-30. The owner's own checkpoint test of the demo is still to come.
- The Hebrew membership type names are suggestions: חברות מלאה, חברות שאינה מלאה, מתמחה, סטודנט/ית, חברות כבוד. Admins can edit them.

## Next step

**M3 Content core:** the plan [`docs/plans/M3-content-core.md`](docs/plans/M3-content-core.md) is written with the owner's answers to its questions and awaits the owner's approval. No M3 code is written before that.
