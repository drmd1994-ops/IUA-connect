# IUA Connect — Project Status

_Last updated: 2026-10-05 (M14 and M15, the mobile app: the members' and visitors' parts of the site are built into the app on the branch `feat/mobile-screens`; almost none of it has been seen on a phone yet; the admin area stays on the site)_

## Summary

| Item                      | Status                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                     | **M2 People & membership: merged 2026-09-30** (pull request #4). M1b Passkeys merged 2026-09-29 (PR #2; the manual Windows Hello check is deferred by the owner until the mobile app exists). M1 Identity merged (PR #1). M0 Foundations complete. **M3 Content core: merged 2026-10-01** (pull request #5). **M4 Content import: merged 2026-10-01** (pull request #6). **M5 Events: merged 2026-10-02** (pull request #7). **M6 Education: merged 2026-10-02** (pull request #8). **M7 Notifications and search: merged 2026-10-02** (pull request #9). **M8 Admin portal completion and dashboards: merged 2026-10-02** (pull request #10). **M9 Pitch readiness: merged 2026-10-03** (pull request #11). **The MVP (M0 to M9) is complete.** M10 Video and push connection points: merged 2026-10-04 (pull request #12). **M11 Private chat: merged 2026-10-05** (pull request #14). **M12 Chat rooms: merged 2026-10-05** (pull request #17). **M13 Groups, invitations, online status and files in chat: merged 2026-10-05** (pull request #18). |
| Mode                      | **Demo / pitch.** A private application to be pitched to the Israeli Urological Association (IUA). Not endorsed by or affiliated with IUA or the Israeli Medical Association (IMA).                                  |
| Repository                | Git repository initialized in `C:\Users\PC\Desktop\IUA CONNECT` (branch `main`, remote `origin` → `https://github.com/drmd1994-ops/IUA-connect.git`, on GitHub). Work is done on `feat/...` branches and merged through pull requests; the owner merges, or asks for it. |
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
| O4  | ~~Permission from IUA/IMA before showing imported content in a pitch~~ **Resolved 2026-10-02:** the owner states that the approval exists. | —                    |
| O5  | ~~Video hosting choice~~ **Resolved 2026-10-02 for the demo:** links to videos hosted elsewhere; no upload or provider yet. A provider is chosen after the pitch (ADR 0008, with M6). | —                    |
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

## M3 Content core (2026-10-01)

Plan: [`docs/plans/M3-content-core.md`](docs/plans/M3-content-core.md), approved by the owner on 2026-09-30. Owner decisions (plan §11):

- **Uploads:** sharp re-encodes images; file-type detects the type from the content.
- **Article text:** Markdown, written in a WYSIWYG editor (TipTap), sanitised on the server (unified/remark) and rendered without raw HTML (react-markdown).
- **Four eyes:** whoever submitted an item can't approve it. Only IUA admins review and publish.
- **Profile photo:** its own "who can see this" setting, private by default.
- **Guidelines:** status is Current, Superseded or Withdrawn; evidence level is optional free text.

Libraries added with the owner's approval: sharp, file-type, unified/remark, pg-boss, react-markdown, TipTap (which brings `marked`).

### Delivered

- **Files:** uploads with an allow-list (JPEG, PNG, PDF, DOCX, PPTX), type detected from the content, per-type size limits, images re-encoded without metadata. Stored outside the web root; downloads only through 5-minute signed addresses after an access check. Staff upload; a member uploads only their own profile photo.
- **Job queue:** pg-boss behind a `JobQueue` interface, in its own `pgboss` schema. Jobs: publish scheduled news (every minute), remove unused uploads (hourly).
- **Access tiers:** public, members, or chosen membership types, applied to every read of news, guidelines and their files. Hidden items are left out of lists and answer "not found" by link.
- **News:** Hebrew and English text with a Hebrew fallback; categories, tags, featured image, attachments, references. Workflow: draft → review → published or scheduled → archived, with send-back comments, revisions of published items, and an append-only history. Emails tell the editor when an item is sent back or published.
- **Guidelines:** details, official link, version history and an optional IUA summary. No third-party documents are stored.
- **Search columns:** Hebrew-normalised search vectors on news and guideline text (the search screen is M7).
- **Web (he/en):** `/news`, `/news/[slug]`, `/guidelines`, `/guidelines/[id]`; `/admin/news` (list and review queue, editor with preview, scheduling in Israel time), `/admin/news/categories`, `/admin/guidelines`; a photo on My profile. The home page and header link to News and Guidelines.
- **Demo seed:** `editor@demo.test` (content editor), seven news items covering every state, four guidelines. Runs once; on a database seeded before M3, `pnpm db:seed` adds it.

### Verified

- API: **162 unit and 169 integration tests**, including every tier against six kinds of reader, the workflow with four eyes, the job publishing a due item once, and the admin access pattern on each admin route.
- Web: unit tests, including Israel-time conversion across daylight saving.
- Playwright (Chromium, local): the **exit test** (editor writes with an image → reviewer schedules → the article appears after the job runs; a members-only article stays hidden from a visitor), a guideline added and opened, and **axe WCAG 2.2 AA checks** on every page visited plus all 34 public-page checks in he and en.

### Deviations and findings

- **Demo guidelines are all fictional** (a made-up society on a reserved domain). The plan allowed naming real organisations as the source, but each entry needs a version and a date that couldn't be verified here. Real entries come with the M4 curated import.
- **Guideline summaries are plain text**, not Markdown, and guideline edits have no stale-save check (news has one).
- **`news_revisions` is not a separate table:** a revision is a news row pointing at its live item (`revision_of_id`).
- **pg-boss permissions:** the `pgboss` schema is created by a migration that grants the app role USAGE and CREATE; pg-boss itself runs without creating schemas.
- **Hebrew file names** arrived garbled (multer read them as Latin-1); fixed and tested.
- **Next.js 16.3.5 → 16.3.6:** a critical advisory (remote code execution in `next/og`) appeared in `pnpm audit` during M3. The app doesn't use that feature; updated so the security job passes.
- **The browser needs each message group listed in the layout.** The new `content` group was missing at first, so the new pages showed no labels; found by the end-to-end test.
- **Local end-to-end runs leave their items behind** (one test article and one test guideline per run) in the development database. An admin can archive or delete them.
- **Editor accounts can't be created in the app yet** (user and role management is a later milestone): the seed and `pnpm admin:create --role CONTENT_EDITOR` create them.

### Open for the owner

- ~~Merge pull request #5~~ merged at the owner's request on 2026-10-01 (CI green). The owner's own checkpoint test of the demo is still to come.
- The Hebrew names of the two demo news categories are suggestions: הודעות האיגוד, הוראה והשתלמות.

## M4 Content import (2026-10-01)

Plan: [`docs/plans/M4-content-import.md`](docs/plans/M4-content-import.md), approved by the owner on 2026-10-01. Owner decisions (plan §11):

- **Conference pages** are saved as fixtures now and loaded in M5, when events exist.
- **Text copied:** title, date and a link. A short excerpt was allowed, but none is kept (see below).
- **Page list:** proposed by Claude, approved by the owner before anything was fetched into fixtures.
- **Real names are removed** from news titles: each source is listed with a reviewed title that names nobody.
- **Year only:** documents show the year the site states, not an invented day and month.
- **Library:** cheerio, a development dependency of the importer only.

### Delivered

- **`tools/importer`** (`pnpm import:fetch`, development only): reads a hand-picked list of pages (`tools/importer/sources.json`), once each, into JSON fixtures.
  - It never follows links or redirects and never lists the site.
  - An address allow-list refuses everything else, including the physician directory, sign-in and form pages.
  - It obeys `robots.txt`, waits between requests and names itself in the user-agent.
  - Results must pass a personal-data check (email addresses, phone numbers, ID-like numbers, people's titles). Any problem means nothing is written.
- **The sample** (fixtures in `apps/api/prisma/fixtures/iua-import/`): 8 news items, 9 documents (one clinical guideline and eight position papers) and one conference page.
- **Seed layer 3** (`pnpm db:seed`): loads the fixtures without any network. News items are public, in a "From the IUA website" category, with the original date and the source address. Documents become guideline entries with the publisher's own link; no document is fetched or stored.
- **`pnpm import:remove`:** deletes everything the import created, and nothing else.
- **Web:** imported news shows "Source: IUA website" in the list and a link to the full item on the IUA website; imported documents show the year only.

### Verified

- Importer: **52 unit tests** (allow-list including directory addresses, `robots.txt`, extraction from pages written for the tests, the personal-data and name checks, link fixes).
- API: **6 integration tests** with fictional fixtures: each item is created once however often the seed runs; source address and original date are kept; removal deletes exactly the imported items.
- Playwright: a visitor opens an imported news item and an imported document, with axe checks.
- CI never contacts the real site.

### Deviations and findings

- **No excerpts.** Most news pages hold no text, only a link to a PDF. The three that do name people without a title a program can spot (journal citation authors, the author of a summary) or are garbled on the site. Excerpts are therefore opt-in per source after a person has read them, and none is kept.
- **One conference page, not three.** Two of the three conference pages redirect to the members' sign-in. Members-only pages are not imported.
- **8 news items, not 10–20:** the site's news list shows eight.
- **The 1999 guideline's link is malformed on the site.** The working address of the same file on www.ima.org.il is used.
- **Six position-paper links are plain `http`** on the site. They are stored as the site gives them.
- **All documents are listed as Current**, including the 1999 guideline: nothing about their status is inferred. An admin can change it.
- **Imported text is Hebrew only**, so English readers see the Hebrew title with the fallback notice.
- **A revision of an imported news item** no longer carries the source address (it stays on the live item), because one source page may only be one row.

### Open for the owner

- **O4 was resolved on 2026-10-02** (the owner states that the approval exists). Written before that: permission from IUA/IMA before showing this content in the pitch. `robots.txt` blocks one AI company's crawler from the whole site, which is worth mentioning when asking. If permission is refused, `pnpm import:remove` takes the sample out.
- Review the reviewed news titles in `tools/importer/sources.json`.
- ~~Merge pull request #6~~ merged at the owner's request on 2026-10-01 (CI green).

## M5 Events (2026-10-02)

Plan: [`docs/plans/M5-events.md`](docs/plans/M5-events.md), approved by the owner on 2026-10-01. Owner decisions (plan §11):

- **Who registers:** anyone signed in who may see the event.
- **Full events:** a waiting list; a cancellation gives the place to the first person waiting.
- **Attendance:** members scan a QR code shown at the venue with their own phone; admins can also mark people by hand. No camera library was added.
- **Reminders:** two emails, 7 days and 1 day before.
- Approved with the plan: event admins publish without a second reviewer; the imported conference page loads as a draft, because the source shows no dates.

No new libraries.

### Delivered

- **Events:** every spec §10 field, Hebrew and English text with the Hebrew fallback, categories, an image, access tiers. States: draft, published, cancelled (a cancelled event stays visible, marked).
- **Sessions and speakers:** sessions inside the event's time span, with speakers in a chosen order and attached materials. Speakers are shared records, not accounts.
- **Registration:** in the app, on another site, or none. An optional capacity with a waiting list; places are counted under a lock on the event, so the last place can't be taken twice. Registration closes when the event starts.
- **Personal schedule:** registered members choose sessions; "My schedule" flags overlaps.
- **Calendar files:** one per event and one for the personal schedule, written by hand to the iCalendar standard.
- **Attendance:** a signed code, valid five minutes and renewed by the admin's screen, for the event or a session. Marking by hand, voiding with a reason, CSV export. Records are append-only at the database level.
- **Emails:** registered, waiting list, promoted, reminders (a week and a day before), event cancelled, time or place changed.
- **Admin (he/en):** `/admin/events` with the event editor, programme, registrations and attendance; `/admin/events/speakers`; `/admin/events/categories`. For EVENT_ADMIN and IUA_ADMIN.
- **Public and member (he/en):** `/events`, `/events/[slug]`, the check-in page a venue code opens, `/account/schedule`. Events joined the header and the home page.
- **Imported conference page (M4):** loaded as a draft event with its source link. An event admin adds the dates and publishes it.
- **Demo seed:** `events@demo.test` (event admin), three fictional speakers and five fictional events covering every state.

### Verified

- API: **197 unit and 226 integration tests** in total. The events part includes five people racing for one place (one gets it, four join the waiting list in order), calendar files read back as calendars, check-in codes that are expired, altered or for another event, the append-only attendance table, and reminders sent once however often the job runs.
- Every admin route for events has the anonymous 401, member 403 and admin-without-MFA 403 tests.
- Playwright (Chromium, local): the **exit test** (an event admin creates and publishes an event with two sessions; a member registers, picks a session, downloads the calendar file and is recorded through the venue code; the admin sees the attendance), with axe WCAG 2.2 AA checks on every page it visits, plus all 40 public-page checks in he and en.
- The Hebrew events list and an event page were also checked by eye from screenshots.

### Deviations and findings

- **Where places are booked in the app, only registered people are recorded** by the venue code. For other events, anyone who may see the event can be recorded.
- **A reminder whose time passed before the person got their place is skipped:** someone who registers three days before gets the day reminder only.
- **Email subjects can now carry the event's title.** The mail renderer filled placeholders in the body only.
- **Calendar links are percent-encoded** in the file (Hebrew addresses), as addresses are.
- **Time ranges** use the language's own formatting. In Hebrew pages they read right to left. The owner chose to keep it (2026-10-02).
- **Location, address and organiser are single texts**, not per language (as in the database design).
- **Local end-to-end runs leave their events behind** in the development database, like the news tests.
- **CI during the build:** each push cancelled the run before it, so no run finished until the last push.

### Open for the owner

- ~~Merge pull request #7~~ merged at the owner's request on 2026-10-02 (CI green).
- The owner's checkpoint test of the demo comes after M6 (said 2026-10-02).
- The Hebrew names of the two demo event categories are suggestions: כנסים, קורסים והשתלמויות.

## M6 Education (2026-10-02)

Plan: [`docs/plans/M6-education.md`](docs/plans/M6-education.md), approved by the owner on 2026-10-02 after one revision that added the exam question demo. Owner decisions (plan §11):

- **Video:** links to videos hosted elsewhere. No upload, no embedded player, no provider yet ([ADR 0008](docs/adr/0008-videos-are-links.md)).
- **Review:** a second person reviews every item, as with news.
- **Courses:** a course groups items in order.
- **Exam question demo:** one multiple-choice question at a time. After the answer: the right option, why it is right, why each other option is wrong, and a short summary of the topic.
- **Sample questions:** Claude drafts them, the owner reviews them. They are loaded waiting for review and nothing is shown before that.
- **Questions are written** in an admin editor with the same review. The access tier is set per question, public by default.
- **Answers** of signed-in people are saved. The first answer to a question counts for the score. Only the person sees their results.
- Approved with the plan: a new permission `education.review` (IUA admins); a published item is taken down to a draft to be edited.

No new libraries.

### Delivered

- **Library:** nine types (video, article, document, presentation, podcast, webinar, surgical video, case, course), with level, subspecialty, duration, CME points (shown only), a cover image, files, references, Hebrew and English text with the Hebrew fallback, and access tiers.
- **Review:** draft, waiting for review, published, archived. The person who submitted can't publish. A reviewer can correct an item in review, send it back with a comment, take a published item down, or archive it. The history is append-only at the database level. Emails: sent back, published.
- **Courses:** lessons in a chosen order. A lesson the reader may not open is shown locked, without its title. A course can't be a lesson (checked in the database).
- **Exam questions:** two to six options, exactly one right (also enforced in the database), an explanation for every option and a topic summary, in Hebrew and English. The right answer and the explanations leave the server only after an answer.
- **Practice:** `/education/exam`, filtered by subspecialty and level, never the same question twice in a visit, with the score of the visit. `/account/exam-results` for signed-in people.
- **Admin (he/en):** `/admin/education` (list, editor, lessons, review, history) and `/admin/education/questions`. For CONTENT_EDITOR (write) and IUA_ADMIN (write and review).
- **Public (he/en):** `/education`, `/education/[slug]`, `/education/exam`. Education joined the header, the home page and the account menu.
- **Demo seed:** ten fictional library items covering every type and state, a course of four lessons (the last one members-only), a one-page sample PDF, and **ten sample urology questions waiting for review** (`apps/api/prisma/fixtures/demo-exam-questions.json`).

### Verified

- API: **228 unit and 253 integration tests** in total, all passing. The education part covers the review steps with four eyes, what each type needs before review, the access tiers for five kinds of reader on items and on questions, locked lessons, and answers that are saved once and counted once.
- Every admin route for education and exam questions has the anonymous 401, member 403 and admin-without-MFA 403 tests.
- Playwright (Chromium, local): both **exit tests** pass (article and course written, published and read in both languages; an exam question written, corrected by the reviewer, published, answered by a visitor and by a signed-in reader, and found in "My exam results"), with axe WCAG 2.2 AA checks on every page they visit, plus all 50 public-page checks in he and en.
- The seeded library was read back through the public API: eight items listed for a visitor, the course with its fourth lesson locked, the sample PDF attached, and no exam question asked before one is published.

### Deviations and findings

- **Nothing medical is shown yet.** The ten sample questions are textbook-level and were written by Claude, not by a urologist. Each one must be read and corrected by the owner before it is published. Until then `/education/exam` says there are no questions.
- **The library items are fictional and carry no medical content.** Their links point to reserved example addresses, so "Open on…" leads nowhere real.
- **Access tiers protect the item page and the link, not the recording** on its host (ADR 0008).
- **CME points are shown only.** Nothing is tracked or credited (Phase 2).
- **OpenAPI types:** a bare `z.number().nullable()` came out as an array type (event coordinates, CME points). Fixed with `nullableNumber()`, and the guard test now covers numbers too.
- **Search** in the library is by type, level and subspecialty. Full-text search arrives with M7; the search column is already maintained.
- **Local end-to-end runs leave their items behind** in the development database. The ones from this session were archived by hand.
- **CI ran out of memory in the integration job** once the suite reached 30 files in one process. The suites still run one at a time, now in a worker that is replaced when it holds 1 GB (`--maxWorkers=1` with `workerIdleMemoryLimit`).

### Open for the owner

- **Checkpoint test of the demo** (asked for on 2026-10-02): the whole product so far, M1 to M6.
- **Review the ten sample exam questions** at `/admin/education/questions` as `admin@demo.test`: correct what needs correcting, publish the ones that are right, send back or leave the rest.
- ~~Merge pull request #8~~ merged at the owner's request on 2026-10-02 (CI green).

## M7 Notifications and search (2026-10-02)

Plan: [`docs/plans/M7-notifications-search.md`](docs/plans/M7-notifications-search.md), approved by the owner on 2026-10-02. Owner decisions (plan §11):

- **Choosing what is sent:** the member chooses which kinds of content are sent as notifications, and turns each kind on or off for the app and for email.
- **Email about new content:** one daily summary, only to members who switched it on, and only when there is something new.
- **Starting settings:** email for new content starts off; notices in the app start on; account, my events and messages from the association start on for both.
- **Broadcast audience:** all active members, or chosen membership types.
- **Directory:** signed-in active members only (D9).

No new libraries.

### Delivered

- **Notices in the app:** a bell in the header with the number of new notices, refreshed about once a minute; a notifications page with "mark as read" and "mark all as read". Notices are kept 180 days.
- **Preferences:** a switch per kind (account and membership, my events, messages from the association, news, new events, education, guidelines) for the app and for email. "Account and membership" is always on. Security emails are not notifications and are always sent.
- **Existing emails** (membership decisions, the person's event registrations, staff work) now also leave a notice in the app, and follow the switches.
- **New content:** a published news item, event, education item or guideline (and a new guideline version) is announced once to everyone who may read it.
- **Daily summary email** for new content, with a signed link that switches those emails off in one step without signing in. Every email that a switch controls carries such a link.
- **Broadcasts (`/admin/broadcasts`):** an admin writes a message for all active members or for chosen membership types; a different admin approves or sends it back with a reason. The database refuses a decision by the author, and a sent message can't be changed or deleted. Recipients read it in the app; emails follow within a minute. Every step is audited.
- **Member directory (`/members`):** opt-in from "My profile", with the consent recorded (wording version, date, history). Only active members read it; the name is always shown and every other field only when its owner made it visible to members. 20 per page, no export, 30 requests a minute per person.
- **Search (`/search`, and a field in the header):** news, events (also by session titles), education, guidelines and listed members, grouped by type. Hebrew-aware: vowel marks and final letters are ignored, a word matches from its start, a word is tried with and without a one-letter prefix, and a small typing mistake in a title word is forgiven. Built on PostgreSQL behind a `SearchProvider` interface.
- **`pnpm job:run <job>`:** runs a scheduled job now (for the demo: the daily summary without waiting for the morning).
- **Demo seed:** a second admin (`admin2@demo.test`), three members in the directory showing different fields, notices of every kind, one broadcast waiting for approval and one sent.

### Verified

- API: **257 unit and 319 integration tests** in total, all passing.
- **Exit criteria:** anti-enumeration (not listed, suspended, expired and never existed give the same answer; private fields are never sent, searched or filtered on), rate limits (directory, search, and search with members, against the real limits), and Hebrew relevance spot checks (title above text, prefixes, word starts, vowel marks, final letters, a typing mistake, an English query).
- Every admin route for broadcasts has the anonymous 401, member 403 and admin-without-MFA 403 tests.
- Playwright (Chromium, local): the four **exit tests** pass (preferences → notice → summary email → unsubscribe; a broadcast approved by a second admin and read by a member; joining the directory and finding a member in Hebrew; a visitor's Hebrew search), with axe WCAG 2.2 AA checks on every page they visit, plus all 62 public-page checks in he and en.

### Deviations and findings

- **A published item is stored once, not once per person.** Who sees it is worked out when a person opens their notices (their switches, the item's access tier, their membership). Publishing therefore costs the same however many accounts there are. A person sees announcements made since their account exists.
- **The access tier of an announcement is the one the item had when it was published.** Changing the tier later doesn't change who was told.
- **The daily summary takes its items before the emails go out**, so nothing is listed twice; if a run is interrupted, the items it took are not listed again.
- **The directory's name search compares normalised text directly**, without the extra index the plan mentioned; the directory holds hundreds of rows, not millions.
- **The first end-to-end test uses a guideline**, not a news article as the plan said: one admin can add a guideline, while news needs an editor and a reviewer. The mechanism is the same.
- **Typo tolerance applies per word and to title words only**, for words of four letters or more. Applied to the whole query it matched unrelated titles that shared one word.
- **Search has no word stemming:** "stones" doesn't find "stone" except through the typo tolerance. Hebrew inflection beyond one-letter prefixes isn't handled. Another engine can replace PostgreSQL later behind the interface.
- **The directory limit is counted per person after sign-in**, in the route; the rate-limit guard runs before authentication and can't know who is asking.
- **CI:** the browser suite had started to hit the real sign-in limit (20 a minute per address) once M6's tests were added, and failed depending on timing. The suite now runs with the limits multiplied (`RATE_LIMIT_SCALE`), which the API refuses in production; the limits themselves are covered by the integration tests.
- **The demo needs two admins** to show a broadcast, so the seed adds `admin2@demo.test`.
- **The bell refreshes about once a minute.** No live connection.

### Open for the owner

- **Checkpoint test of the demo** (still open from M6): now M1 to M7. For M7: the bell and "Choose what you receive" as a member; `/admin/broadcasts` as `admin@demo.test` (approve the waiting message); `/members` as a member; the search field with a Hebrew word.
- **Review the ten sample exam questions** at `/admin/education/questions` (still open from M6).
- ~~Merge pull request #9~~ merged at the owner's request on 2026-10-02 (CI green).
- The wording of the directory consent (`directory-2026-10`) should be read by whoever does the legal review before real data.

## M8 Admin portal completion and dashboards (2026-10-02)

Plan: [`docs/plans/M8-admin-dashboard.md`](docs/plans/M8-admin-dashboard.md), approved by the owner on 2026-10-02. Owner decisions (plan §11):

- **Roles:** super admins only give and remove roles.
- **Settings:** the association's contact details in the footer, and a notice banner. Opening and closing sign-ups was not chosen.
- **Member dashboard:** the home page after sign-in; visitors keep the public home page.

No new libraries.

### Delivered

- **Admin dashboard (`/admin`):** applications waiting, members by state and type, items waiting for review, messages waiting for approval, events in the next 30 days, locked and disabled accounts. Each person sees only the parts they may act on, and each number links to the list it counts.
- **Accounts (`/admin/users`):** a list with search and filters; an account page with its state, roles, two-step verification, last sign-in, open sessions and membership. Actions: disable and enable, end a lock, sign out everywhere. Each needs a reason and is audited. Passwords and second factors are never shown or changed here.
- **Roles:** super admins give and remove roles on the account page; a table shows what each role may do. Nobody changes their own account or roles, only a super admin acts on a super admin, and the last super admin can't be disabled or lose the role.
- **Audit log (`/admin/audit`):** read-only, filtered by action, person, subject and dates. Each look at the log is itself recorded.
- **Settings (`/admin/settings`, super admins):** the association's contact details, shown in the footer of every page, and a notice shown at the top of every page while it is switched on.
- **Member dashboard:** after sign-in the home page shows the membership, new notifications, upcoming events (the person's own first), the newest news and education, and quick actions. Create a case, post research, ask the community and open a calculator are shown as "Coming soon": labelled, and neither links nor buttons.
- **The public home page** now lists membership as available (it has worked since M2) and no longer has an "On the way" section.
- **Demo seed:** a super admin (`super@demo.test`), fictional contact details, and a sample notice written but switched off.

### Verified

- API: **265 unit and 344 integration tests** in total, all passing.
- **Exit criterion:** the sweep reads every admin route from the running application (more than 80) and checks that each declares a permission and refuses an anonymous caller (401), a member (403) and an administrator without two-step verification (403). That an administrator in a verified session gets through is tested per screen.
- Playwright (Chromium, local): the three **exit tests** pass (dashboard → disable an account → audit log → give a role; settings shown on every page; the member dashboard with its "Coming soon" actions), with axe WCAG 2.2 AA checks on every page they visit. The whole suite was run: 89 of 90 passed, and the one failure (an older events test) was fixed and re-run.

### Deviations and findings

- **No `GET /me/dashboard`.** The member dashboard is put together in the page from the routes that already exist (membership, notifications, events, news, education), so each part follows the same access rules as its own page and nothing is duplicated.
- **Roles are given and removed with two POST routes**, each carrying a reason, instead of a DELETE.
- **Removing a role ends the person's sessions**, so nothing stays open under the old role.
- **A new access rule, `@RequireAnyPermission`,** for the dashboard: it is open to anyone who works in the admin area. The deny-by-default check and the sweep know it.
- **The admin area now opens on the dashboard** for everyone, where it used to jump to the person's first screen. Two older browser tests were updated.
- **Fixed on the way (from M5):** the venue check-in page could send its request twice and then show "already recorded" for a first check-in. It now sends it once.
- **A locked account answers a sign-in like a wrong password** (so nobody learns it is locked); the accounts screen is where an admin sees the lock.
- **The dashboard's numbers are counted when the page opens.** No charts and no history.
- **The demo notice is switched off** in the seed; switch it on in Settings to see it.

### Open for the owner

- **Checkpoint test of the demo** (still open): now M1 to M8. For M8: `/admin` as `admin@demo.test`; an account page and the audit log; roles and Settings as `super@demo.test`; the home page as `member.full@demo.test`.
- **Review the ten sample exam questions** at `/admin/education/questions` (still open from M6).
- ~~Merge pull request #10~~ merged at the owner's request on 2026-10-02 (CI green).

## M9 Pitch readiness (2026-10-02)

Plan: [`docs/plans/M9-pitch-readiness.md`](docs/plans/M9-pitch-readiness.md), approved by the owner on 2026-10-02. Owner decisions (plan §9):

- **Two-step verification in the pitch:** one fixed authenticator secret for the demo staff accounts, kept in `.env`, not in the repository.
- **Screen-reader check:** the owner does it, with a checklist.
- **Security scan:** in CI on GitHub (one pinned action, `zaproxy/action-baseline`, approved).
- **Measuring speed:** Lighthouse from the command line (`npx`, not added to the project).

No new libraries in the application.

**State: complete.** The owner walked through the demo and did the screen-reader check on 2026-10-03, and asked for pull request #11 to be merged the same day.

### Delivered

- **`pnpm demo:reset`:** rebuilds the demo from nothing (database, seed, outbox, uploaded files) and sets up two-step verification for the demo staff with one shared authenticator entry. It asks for the database name before deleting, and refuses anything but the development database on this machine.
- **Demo script** (`docs/demo/DEMO_SCRIPT.md`): a 15-minute walk-through and a 5-minute one, with the accounts to use and what to do when something goes wrong.
- **Accessibility:** an audit of every page in both languages (axe, keyboard, 320 px width), the fixes it led to, an accessibility statement at `/accessibility`, and a checklist for the screen-reader check (`docs/demo/NVDA_CHECKLIST.md`).
- **Performance** (`docs/demo/PERFORMANCE.md`): measured before and after. A third less script on every page, layout jumps removed, and an index for the audit log page.
- **Security scan:** the OWASP ZAP baseline runs in CI on every change (`docs/security/ZAP_BASELINE.md`). One finding fixed, six accepted with reasons.
- **Known limitations** (`docs/demo/KNOWN_LIMITATIONS.md`): what is demo-only, what is not reviewed, what is not built, what is rough, and the decisions waiting for the association.
- **Documents brought in line with the code:** README (a pitch section first), HANDOFF, ARCHITECTURE, API_DESIGN, DATABASE_DESIGN, DEPLOYMENT (a readiness checklist with an owner for each line), TESTING, SECURITY_MODEL.
- **Seeded texts read through** in Hebrew and English; three slips corrected.

### Verified

- **CI is green on the branch** (run 37050661686, commit `801bc9d`): lint, type check, unit, integration, the browser suite, the secret and dependency scan, the ZAP scan and the build.
- API: **271 unit and 344 integration tests**, all passing. Browser suite (Chromium, production builds): **97 tests**, all passing, including the accessibility audit.
- **Accessibility audit:** no WCAG 2.2 AA violations (axe) on every member page and every admin page in Hebrew and English; every control reachable by keyboard with a visible focus; no sideways scrolling at 320 px.
- **ZAP baseline:** the site (51 addresses) and the API (7 addresses): no failures and no warnings, with six accepted rules listed and explained.
- **Lighthouse** (mobile, simulated slow 4G, production builds, one run per page, on this computer): the before and after table is in `docs/demo/PERFORMANCE.md`.
- **`pnpm demo:reset`:** run from start to finish on a scratch database (since removed), and the demo script was walked through on that reset database. Its safety check has unit tests.
- **The owner's part (2026-10-03):** `pnpm demo:reset` on the development database, the walk-through of the demo script (one finding, fixed: where staff land after signing in), and the screen-reader check with NVDA (no problems noted).

### Deviations and findings

- **One dependency advisory is accepted in the audit (2026-10-03).** A new high-severity advisory for `braces` (lint tooling only, no fixed version yet) turned the security job red. With the owner's agreement it is listed as an exception with its reason (`pnpm-workspace.yaml`, `SECURITY.md`). **To do later:** remove the entry when a fixed version exists.
- **Where sign-in lands changed after the owner's walk-through (2026-10-03).** In M8 the owner chose the home page after sign-in for the personal dashboard, and every account landed there. The owner found that confusing for staff, so an account that may use the admin area now lands on the admin dashboard; everyone else still lands on the home page, and staff still see the personal one at the home page. A browser test checks it.
- **The speed target is met only in part.** Layout jumps and blocking are within the targets on every public page. The main content appears at about 3.0 s on Lighthouse's simulated slow phone (the article at 3.5 s), against a target of 2.5 s; before the work it was 3.0 to 3.9 s. On the computer itself it is 0.1 to 0.25 s. The fix is to have the server send public pages complete, which changes how every public page is built; it was not in the plan and is proposed as the first task after the pitch.
- **Caching headers on public API answers were not added**, although the plan listed them as a possible fix: they don't help a first visit, and the same addresses answer differently for members.
- **Planned "interface only" items were never created, and no earlier milestone recorded it.** The planning documents (decisions D2, D4, D8 and D13, and the architecture's adapter table) said that the `payments` and `invoices` tables and the `PaymentProvider`, `VideoProvider`, `PushProvider`, `IdentityProvider` and `MembershipSource` interfaces would exist in the MVP. None do. The documents now say so; nothing was built in M9, because it is not in the M9 plan. **The owner decides** whether to add them now or with the feature that needs each one (see "Open for the owner").
- **An index was missing for the audit log page** (newest first). Found with `EXPLAIN`, added as a migration.
- **"Not found" pages for file-like addresses had no Content-Security-Policy.** Found by the scan, fixed.
- **`pnpm demo:reset` was run on a scratch database, not on the development database.** Emptying the development database is the owner's to do; the first real run is theirs.
- **The older `pnpm db:reset` was not checked.** Prisma refuses to let an AI agent run it without the owner's consent. Use `pnpm demo:reset`.
- **The demo's department directors are fictional people at real hospitals** (Rambam, Sheba), as decided in M2. In a pitch, say that they are invented.
- **The remaining layout jump (0.031 on every page)** is under the limit; its cause was not tracked down.

### Open for the owner

1. ~~Run `pnpm demo:reset` and walk through the demo from the script~~ **Done 2026-10-03:** the owner reset the demo and walked through the script. One finding: a staff account landed on the personal home page after signing in, and the script wrongly said the admin area opens by itself. At the owner's request staff now land on the admin dashboard (see "Deviations and findings").
2. ~~The screen-reader check~~ **Done 2026-10-03:** the owner went through `docs/demo/NVDA_CHECKLIST.md` and noted no problems. The accessibility statement now says so.
3. ~~Review the ten sample exam questions~~ **Done 2026-10-02:** the owner (a urologist) read the ten questions and found them fine, and asked that the demo load them published. The seed does so since then, with a history entry naming the review. A database seeded earlier keeps them waiting for review until the next `pnpm demo:reset`.
4. **Decide about the "interface only" items** above: build the payment tables and the five interfaces now, or leave each to its feature. **2026-10-03:** the owner asked for video and push; they are built in M10. The other three are still open.
5. **Confirm the "who" column** of the readiness checklist in `DEPLOYMENT.md`.
6. ~~Merge pull request #11~~ merged at the owner's request on 2026-10-03 (CI green).

## M10 Video and push connection points (2026-10-03)

Plan: [`docs/plans/M10-video-push-interfaces.md`](docs/plans/M10-video-push-interfaces.md), approved by the owner on 2026-10-03. The owner asked for two of the five unbuilt "interface only" items (M9, "Deviations and findings"): video and push. Owner decisions (plan §6): **interface only** for both, with no video service and no real push.

No new libraries. No database change.

### Delivered

- **`VideoProvider`** (`apps/api/src/infra/video/`): the place a video service plugs in. Its one implementation, `LinkVideoProvider`, is what the app did before: a recording is a link to where it is hosted (ADR 0008). Education now asks the provider whether a link may be attached and what address a viewer gets.
- **`PushProvider`** (`apps/api/src/infra/push/`): the place a push service plugs in. Its one implementation, `DisabledPushProvider`, sends nothing. The notifier hands it each notice in the app, in the person's language, with a link inside the site.
- **Settings:** `VIDEO_PROVIDER=links` and `PUSH_PROVIDER=disabled`, checked at start-up; both are allowed in production.

**Nothing a visitor or a member sees has changed.** There is still no video hosting and there are still no push notifications.

### Verified

- API: **286 unit and 351 integration tests**, all passing, locally and in CI; the browser suite passes in CI unchanged.
- With a stand-in for a hosted video service: education refuses a recording the provider does not take, stores the reference and not a viewer's address, and gives each viewer the address the provider returns.
- With a recording push provider: a notice reaches it only for the right person and only when that kind is switched on in the app; when the push service fails, the notice in the app and the email are still delivered.
- The existing education and notification tests pass unchanged.

### Deviations and findings

- **One commit for both providers** instead of one each, because they share the settings, the app wiring and the test harness.
- **The link provider accepts `http` as well as `https`,** because the education form already did; the plan's first draft said `https` only. Nothing was tightened, so no existing item is affected.
- **A new error text** (he/en) for a recording the provider refuses. With the link provider it can't appear, because the form's own check comes first; it exists for a provider that is choosier.
- **Push follows the "in the app" switch.** There is no separate push switch, no list of a person's devices and no route for a phone to register. They come with whatever can actually deliver.
- **These interfaces are a best guess.** No real service was chosen, so they may change when one is plugged in.

### Open for the owner

- ~~Merge the pull request~~ merged at the owner's request on 2026-10-04 (pull request #12, CI green). There was nothing new to click: the demo is that the site behaves as before.
- Still open from M9: whether the remaining three items (payment tables and `PaymentProvider`, `IdentityProvider`, `MembershipSource`) are built now or each with its feature; and the "who" column of the readiness checklist in `DEPLOYMENT.md`.

## M11 Private chat (2026-10-05)

Plan: [`docs/plans/M11-chat.md`](docs/plans/M11-chat.md), approved by the owner on 2026-10-04 with the recommended answer to every question (plan §12). The owner's request is `chat.md.txt` (private chat and public rooms, about a hundred capabilities). Owner decisions:

- **Three milestones.** M11 is the shared foundation and private chat; M12 public rooms and their moderation; M13 files and online status.
- **Live messages with what the project already has.** No new library ([ADR 0009](docs/adr/0009-live-updates-by-event-stream.md)).
- **Who can be written to:** members listed in the directory, each of whom can choose "nobody".
- **Staff** see only a reported message with the five before and after it, and every look is recorded. **Messages are kept** until deleted; the real period is for the legal review.
- **No files or images** in M11.
- **Read status and "is typing…"** are on at the start; each person can switch theirs off.
- **Doctor/patient chats** are not planned at all (patient information is not allowed in this project).

No new libraries.

**Merged** into `main` on 2026-10-05 at the owner's request (pull request #14, squash commit `8c2b494`), with green CI. **The owner did the checkpoint test on 2026-10-05 and found it good.**

### Delivered

- **Chat in the top menu** for members, with the number of conversations that hold unread messages. `/chat` lists the conversations; `/chat/[id]` is one conversation. Side by side on a wide screen, a screen each on a phone, right to left in Hebrew.
- **Conversations:** "New conversation" finds listed members by name; "Send a message" is also on a member's directory page. One conversation per pair.
- **Messages:** plain text up to 4,000 characters, Enter to send. Reply with a quote, edit for 15 minutes, delete for everyone, delete for me, copy. Each message's menu lists only what that person may do. Web addresses become links.
- **Sent, delivered, read** on your own messages; unread counts; "mark as unread".
- **Live:** new, edited and deleted messages, read status and "is typing…" arrive without refreshing. If the connection can't be opened, the page asks every ten seconds.
- **Per conversation:** mute (8 hours, a week, until switched back), archive, search inside it. Search across all of a person's conversations, Hebrew-aware like the site search.
- **Blocking and reporting:** block from the conversation or from a directory page; report a message or a person, with a reason from a list kept in the database.
- **Chat settings (`/account/chat`):** who can write to me, read status, typing, and the people I blocked.
- **Notifications:** a new kind, "Private messages". In the app it is the number on the Chat link. By email it is at most one message a day saying that unread messages are waiting, without their text or sender. The push connection point is handed a notice (it still sends nothing).
- **Staff (`/admin/chat/reports`, permission `chat.moderate`, IUA admins):** the reports, open ones first; a report with the kept messages; dismiss, delete the message, or suspend the person from sending (for days, or until lifted); the list of suspensions. A tile on the admin dashboard counts open reports. There is no screen for reading conversations.
- **A standing note** above the message box: "Do not write details that identify a patient."
- **Demo seed:** three conversations between the listed demo members (Hebrew and English, unread messages, one muted), one blocked pair and one report waiting.
- **Database:** nine tables, shared by private chat and the later rooms. The migration only adds.

### Verified

- API: **294 unit and 408 integration tests**, all passing (57 of the integration tests are chat's).
- **Exit criteria:**
  - Nobody outside a conversation can read it or learn that it exists: tested on every chat route, with the same answer as for an invented id.
  - A message appears on the other person's open page within two seconds, with no refresh: checked by the browser test, against the built servers on this computer.
  - A conversation of 10,000 messages pages correctly, and the paging and unread queries use their index.
  - The admin access pattern on every admin chat route (also covered by the sweep of all admin routes).
  - No WCAG 2.2 AA violations (axe) on the chat pages and dialogs, in Hebrew and English.
- Playwright (Chromium, production builds, local): the four chat tests pass; the whole suite: **101 tests, all passing**.
- Lint, type check and the formatting check are clean.
- **CI is green on the branch** (pull request #14, run 37236557575): lint, type check, unit, integration, the browser suite, the secret and dependency scan, the ZAP scan and the build.
- Before any chat code: an event stream was sent through the built web server's forwarding of `/api/v1` and arrived piece by piece, with the sign-in header.
- The chat list, a conversation, sending and the message menu were also looked at in a browser by Claude.

### Not verified

- **The screen-reader check** was not repeated for the chat pages; only the automated checks ran.
- **How many open connections one server holds** was not tested.
- **The demo script's new chat section** was written from the screens, not walked through start to finish.

### Deviations and findings

- **Messages are numbered inside their conversation** (`seq`), and the read and delivered markers are numbers, not message ids as the plan said. The project's ids are ordered by time only to the millisecond, so two messages sent in the same millisecond could have changed places.
- **Reading one's own conversations needs only a signed-in account;** starting a conversation and sending need an active membership (the plan's rule that an ended membership can read and not send). The Chat link is shown to active members and to people who already have conversations.
- **The writer needs a first and last name** before starting a conversation, because the person written to sees it, also when the writer is not listed in the directory.
- **A person can block only someone they have a conversation with, or a listed member.** Any other id answers "not found", so blocking can't be used to test who has an account.
- **The blocked person's page shows nothing about the block:** for them the conversation looks open, and their message is refused with "This message can't be delivered."
- **The email goes out when a message has waited half an hour unread,** checked every half hour, at most once a day, and never again for the same message.
- **One decision per report** (dismiss, delete the message, or suspend). To do both, staff decide on the report and suspend from the list.
- **The copy of messages kept with a report is erased 90 days after it is closed,** by a daily job.
- **Staff can suspend a person directly,** without a report; the plan listed the route.
- **A new event, "refresh",** tells a person's open pages to ask again (after a suspension). The plan's list of events did not have it.
- **Two existing tests were changed,** not only added to: the list of notification kinds now has "Private messages", and the dashboard has a chat part. The plan said the existing suites would pass unchanged; these two could not.
- **A real bug found on the way:** chat's "unread count" answer had the same class name as the notifications one. The API document then held one schema for both, and the bell's types were wrong until the web was type-checked. Renamed, and a test now refuses two DTO classes with one name.
- **A window opened with the browser's own dialog closed itself in development,** because React mounts a component twice there and the dialog's "close" event came from the first one. The window now closes on Escape through "cancel" instead. Found by the browser tests.
- **Local browser tests against `pnpm dev` lost their sign-ins** when the API restarted under them. They pass against the builds, as in CI. Written into `TESTING.md`. What makes the watcher restart during a run was not tracked down.
- **Seen in development, not caused by chat and not fixed:** when a page reloads while it is renewing the session, the server has already changed the refresh token and the browser never receives the new one; the next renewal then looks like a reused token and the session is ended. It needs a decision (a short grace period for the previous token), so it is brought to the owner and not changed here.
- **A long conversation is not virtualised:** 50 messages load at a time and stay on the page. No new library was added for it.
- **The running development database** got the chat demo data from `pnpm db:seed`, and test messages and reports from the browser tests. `pnpm demo:reset` clears them.

### Open for the owner

1. ~~Checkpoint test of the demo~~ **Done 2026-10-05:** the owner reset the demo, tried chat and found it good.
2. ~~Merge pull request #14~~ merged at the owner's request on 2026-10-05 (CI green).
3. ~~The session bug above~~ **Fixed 2026-10-05** at the owner's request (see "After M11" below).
4. ~~The wording of the Hebrew chat texts~~ **Read by the owner on 2026-10-05 and found good.**
5. **M12 (public rooms)** needs its own plan when the owner wants it.
6. **The three unbuilt connection points** (payments, outside sign-in, the Medical Association's member list): the owner decided on 2026-10-05 to leave them for now; each is built with the feature that needs it.
7. Still open from M9: the "who" column of the readiness checklist in `DEPLOYMENT.md`.

### After M11 (2026-10-05)

- **The session was ended when a page reloaded during a renewal.** The server had already changed the refresh token, the browser never received the new one, and the next renewal looked like a stolen token. Fixed at the owner's request: a token used less than 10 seconds ago is accepted once more, if the token that replaced it was never used. The lost token is used up at that moment and the event is audited. Any other use of an old token still ends the session.
  - **The 10 seconds are Claude's choice;** the owner asked for the fix, not for a number.
  - **What it costs:** someone who stole a token and uses it within 10 seconds of its owner is not caught at once. They are caught at the owner's next renewal, which finds its own token used and ends the session. Tested.
  - The existing reuse test now waits out the 10 seconds; three tests were added (a lost answer repeated; an old token after its replacement was used; a quick thief). `SECURITY_MODEL.md` describes the rule.
- **`HANDOFF.md` was brought up to date** with M11.

## M12 Chat rooms (2026-10-05)

Plan: [`docs/plans/M12-chat-rooms.md`](docs/plans/M12-chat-rooms.md), approved by the owner on 2026-10-05 ("i approve the plan") with the recommended answer to every question (plan §12). Owner decisions:

- **Who can join:** any active member. Their name is shown to the people in the room, and they are told before the first join.
- **Open rooms only.** Rooms by invitation come in M13.
- **Staff open rooms** and appoint members as moderators of a room.
- **Staff with the chat permission** can open any room, read it and act as a moderator. Private conversations stay closed to staff.
- **Reactions:** a fixed set of six, in rooms and in private chat.
- **Email about rooms** is off at the start. In the app: mentions, replies and announcements, under the bell.

No new libraries.

**Merged** into `main` on 2026-10-05 at the owner's request (pull request #17, squash commit `a1f8184`), with green CI. The security scan (ZAP) failed once in CI without scanning anything and passed when run again; nothing was changed in between. **The owner marked the checkpoint test as good on 2026-10-05.**

### Delivered

- **Chat has two sides:** Private and Rooms. `/chat/rooms` lists the rooms a member is in, with unread numbers; `/chat/rooms/browse` lists every open room, with search and a category filter; `/chat/rooms/[id]` is one room. Side by side on a wide screen, a screen each on a phone, right to left in Hebrew.
- **Joining and leaving.** Before joining, the member is told that the people in the room will see their first and last name. A member who has not joined sees a room's name, description and number of people, nothing else.
- **In a room:** messages with the writer's name and picture, replies with a quote, edit and delete as in private chat, copy, "delete for me". Web addresses become links.
- **Reactions:** six (👍 ❤️ 😂 😮 🙏 ✅), from a message's menu; pressing a reaction under a message adds or takes back your own. **Private chat has them too.**
- **Mentions:** typing "@" and the start of a name offers the people in the room. The name stands out in the message, and the person gets a notice.
- **Announcements and pins:** a moderator can send a message as an announcement (it stands out, and the room is told), and pin up to five messages to the top of the room. An **announcements room** takes messages from moderators only.
- **Moderators** (members the staff appoint): delete a message ("Removed by a moderator" stays in its place), remove a person, ban a person (for days, or until lifted), lock the room (an hour, a day, or until unlocked), see and lift bans. Each needs a reason where it concerns a person, and each is in the audit log. The tools are in the message's menu and under **Details**.
- **Per room:** mute, mark as unread, search inside it, the list of people, report the room.
- **Live:** messages, edits, deletions, reactions, pins, locking and "is typing" arrive without refreshing. A person who is removed or banned sees the room close at once.
- **Notifications:** a new kind, "Chat rooms": a mention, a reply to you, an announcement. In the app they are under the bell, one notice per message, the most personal one. Email about rooms is off unless the member switches it on.
- **Staff, rooms (`/admin/chat/rooms`, permission `chat.rooms.manage`, IUA admins):** the list; open a room (Hebrew and English name and description, category, picture, "announcements only"); change, archive and restore it; appoint and remove moderators, found among the active members; a page for the room categories and for the report reasons (which had no screen in M11).
- **Staff, reports:** a report can be about a room message or about a room as such. The reports screen names the room, and offers "archive the room" as a decision.
- **Demo seed:** five categories and six fictional rooms (General, Announcements, Questions and answers, Professional discussion, Conferences and events, Residents), in Hebrew and English, with a pinned announcement, reactions, a reply, a mention, a message removed by a moderator, one person banned for a week and one report waiting. Nothing medical.
- **Database:** four new tables and new columns on two existing ones. The migrations only add.

### Verified

- API: **298 unit and 446 integration tests**, all passing (35 of the integration tests are the rooms').
- **Exit criteria:**
  - Only people who may be in a room read it: tested on every room route, for someone who is not an active member, a member who has not joined, one who was removed and one who is banned.
  - Only moderators moderate: every moderation action tested as an ordinary person in the room, as a moderator of another room, as the room's moderator and as staff.
  - A room of 2,000 members and 10,000 messages: the browse list, the room, a page of messages and the unread count go through an index, and a message sent is one event that doesn't list the people. **This was tested in the database and the API, not with 2,000 open browsers.** The two-second arrival was checked by the browser test in a small room.
  - The admin access pattern on every new admin route.
  - No WCAG 2.2 AA violations (axe) on the room pages and dialogs, in Hebrew and English, and on the three admin room pages.
  - Private chat keeps working: the three M11 integration suites and the four M11 browser tests pass.
- Playwright (Chromium, production builds, local): the four room tests pass; the whole suite: **105 tests, all passing**.
- Lint, type check and the formatting check are clean.

### Not verified

- **The screen-reader check** was not done for the room pages (nor, since M11, for the chat pages); only the automated checks ran.
- **How many open connections one server holds** is still not tested.
- **The demo script's rooms section** was written from the screens and the seed, not walked through start to finish.
- **Uploading a room picture** was not tried in a browser; the upload itself is the one news uses.
- ~~The Hebrew room texts were not yet read by the owner~~ **Read by the owner on 2026-10-05;** no change was asked for.

### Deviations and findings

- **Rooms have their own message routes** (`/chat/rooms/{id}/messages`, `/read`, `/typing`). The plan said the M11 routes would serve rooms too. Keeping them apart left the private-chat rule ("only its two people, anything else is not found") untouched. Editing, deleting and hiding one's own message, and reactions, are shared routes.
- **A member who has not joined gets a clear refusal, not "not found".** The plan's exit criterion said "the same answer as for an invented id". For a room that "Browse rooms" shows to every active member, that hides nothing, and the page could not tell "join first" from "gone". So: someone who may not see rooms at all gets "not found" on every room route; an active member outside the room gets its details and a refusal (`chatRoomNotJoined`) for its messages, people and pins.
- **Staff read any room and moderate it, and don't write in it unless they joined it as a member.** The plan said "read it and act as a moderator"; it did not say whether staff write without joining. They don't, so every message in a room is from someone the room's list shows. Joining needs an active membership, for staff as for anyone.
- **A report about a room as such** uses the existing report columns (the room, no message, no person); no column was added.
- **The "messages are waiting" email** now says "chat messages" and covers rooms for a member who switched room emails on. Its wording was changed so that it doesn't say "private".
- **A moderator can't act on another moderator or on themselves;** staff can. The plan said only the first half.
- **A removed person may join again at once.** To keep someone out, a moderator bans them.
- **"Is typing" in a room** names one person, or says "several people".
- **The moderator search on the admin room page** uses the membership list, which needs `membership.read`. IUA admins have both permissions; a role with only `chat.rooms.manage` would see an error there.
- **The browser tests differ a little from the plan's list:** the member writes in English in the two-window test (Hebrew is covered by the phone test); the report in the browser test is about a room as such, and the report about a room message is covered by the integration test.
- **Enum values in their own migration:** PostgreSQL can't use a new enum value in the transaction that adds it.
- **Integration tests that signed several people up at the same moment** failed now and then with a dropped connection. They now create people one after another. Not a product bug as far as could be seen; the cause in the test harness was not tracked down.
- **The message menu, the reactions and the message box** were moved out of the private conversation screen into a shared file, so rooms and private chat use the same ones.
- **The running development database** got the demo rooms from `pnpm db:seed`, and test rooms, messages and reports from the browser tests. `pnpm demo:reset` clears them.

### Open for the owner

1. ~~Checkpoint test of the demo~~ **Marked as good by the owner on 2026-10-05.**
2. ~~Merge the pull request~~ merged at the owner's request on 2026-10-05 (pull request #17, CI green).
3. ~~The wording of the Hebrew room texts~~ **Read by the owner on 2026-10-05;** no change was asked for.
4. **M13 (files, online status, rooms by invitation)** needs its own plan when the owner wants it. Files wait for the legal review.
5. Still open from M9: the "who" column of the readiness checklist in `DEPLOYMENT.md`.

## M13 Groups, invitations, online status and files in chat (2026-10-05)

Plan: [`docs/plans/M13-chat-groups-status.md`](docs/plans/M13-chat-groups-status.md), approved by the owner on 2026-10-05. The owner answered each question (plan §11) and three more about video (plan §12):

- **Files are built now, and video too.** This changes the earlier decision that files wait for the legal review. The review is still needed before real use.
- **Online and "last active":** on at the start, shown only to people you already have a conversation or a group with, rounded, with one switch.
- **Groups:** any active member, up to 50 people, every invitation must be accepted.
- **One milestone.**
- **Forwarding:** marked "Forwarded", without the writer's name, and it carries pictures, PDF and video.
- **Staff and groups:** staff see only a report.
- **Video:** MP4 up to 100 MB, one a message; stored as it was sent, with what the phone wrote into it; played by the browser's own player.

No new libraries.

**Merged** into `main` on 2026-10-05 at the owner's request (pull request #18, squash commit `4feef55`), with green CI on the first run. **The owner marked the checkpoint test as good on 2026-10-05.**

### Delivered

- **Group chats.** "New group" on the Private side of Chat: a name and the people to invite. A group is listed beside private conversations. In it: everything a room message has (replies, the six reactions, mentions, edit, delete, "delete for me", copy, report), and the people of the group. Its admin renames it, invites, removes a person and hands it over; when the admin leaves, the person who has been in it longest runs it.
- **Invitations (`/chat/invitations`).** Nobody is put into a group or a room. The invited person sees who invited them and, for a group, who is in it, and nothing that was written. Accept, decline, or decline and block. An invitation ends after 30 days. A notice under the bell.
- **Rooms by invitation.** Staff tick "by invitation" in a room's editor. The room is not in "Browse rooms"; its moderators and staff invite members from the room's details.
- **Who can invite me:** a new chat setting (members who could write to me, only people I already talk with, or nobody).
- **Online and "last active".** A dot and "Active now" beside a person who has chat open; otherwise "active today", "this week" or "a while ago". In the list of conversations, in a conversation's heading and in a group's list of people. One switch in chat settings.
- **Files in messages,** in private conversations, groups and rooms: JPEG and PNG pictures and PDF up to 10 MB, MP4 video up to 100 MB, three files a message and one video at most. A picture opens large; a PDF downloads; a video plays in place. A message may be files without a text. Two standing notes beside the attach button: not to send anything of a patient, and what a video still carries.
- **Forwarding:** "Forward" in a message's menu, to any conversation, group or room the member can write in.
- **Pinned conversations:** up to five, at the top of a person's own list (conversations, groups and rooms).
- **Finding a message:** search by day and "only what I wrote"; "Go to this message" opens the conversation at that message, with a way back to the newest.
- **Demo seed:** a pinned group of the three demo members with a drawn sample picture and a sample PDF; a group and a room by invitation that the demo member is invited to. No sample video. Nothing medical, and no picture of a person.
- **Database:** two new tables and new columns; three migrations.

### Verified

- API: **301 unit and 466 integration tests**, all passing (20 of the integration tests are M13's).
- **Exit criteria:**
  - Nobody outside a group reads it, staff included: tested on every group route, with the same answer as for an invented id.
  - Nobody is in a group or a room before accepting: tested, and that three people accepting the last place at once leave a group at fifty.
  - A room by invitation doesn't exist for a member who is not in it: tested on every room route, for someone not invited and for someone invited who has not accepted.
  - Online status is never shown against a person's switch: no route and no event.
  - A file is readable only by the people who can read its message, and not after the message is deleted or the person left.
  - Private chat and rooms keep working: the M11 and M12 suites pass. One M11 test was changed (the chat settings now have two more).
  - No WCAG 2.2 AA violations (axe) on the new pages and dialogs, in Hebrew and English.
- Playwright (Chromium, production builds, local): the five M13 tests pass; the whole suite: **110 tests, all passing**.
- Lint, type check and the formatting check are clean.

### Not verified

- **That a real phone video plays** in the browsers people use. The tests send the start of an MP4 file and check that it is stored and delivered whole and in parts. Nobody watched a film in a message.
- **A 100 MB upload** was not tried; a 12 MB one was.
- **The screen-reader check** was not done for any chat page since M11; only the automated checks ran.
- **How many open connections one server holds** is still not tested, and M13 adds a message between server processes every thirty seconds.
- **The demo script's new section** was written from the screens and the seed, not walked through start to finish.
- ~~The Hebrew texts of M13 were not yet read by the owner~~ **Read by the owner on 2026-10-05;** no change was asked for.
- ~~The owner's checkpoint test of M12 was never done~~ **Marked as good by the owner on 2026-10-05,** after both M12 and M13 were merged.

### Deviations and findings

- **"Online" means a chat page is open.** The plan also said the browser tab must have been in front in the last five minutes. That part was not built; a tab left open in the background counts as online.
- **A video is not handed to the virus scanner.** It is never read into memory, and the scanner's connection point takes a file in memory. The demo has no scanner anyway; a real one would have to be changed to check videos. Written into `SECURITY_MODEL.md` and the readiness checklist.
- **A database rule from M11 was relaxed.** It said a message that is not deleted has text. A message can now be files only, so the database keeps the other half of the rule and the API checks "a text or a file".
- **A file of a message is closed to its uploader once they leave the conversation, and to staff who may upload content.** Before M13 the files module let an uploader, and staff with the upload permission, read any file they could name. For chat files only the people of the conversation count.
- **Deleting a message doesn't take its file back from a conversation it was forwarded to.** The file lives as long as any message carries it. The plan said "deleting a message for everyone deletes its files"; with forwarding of files (the owner's answer) that can only hold for the last copy.
- **A group's name is not written to the audit log,** and neither are group messages. The log records that a group was made, renamed, handed over, and who was invited or removed.
- **Invitations are limited to 60 a day per person,** not 30 as the plan said, because making a group of fifty needs 49 at once.
- **Inviting to a room by invitation finds only members listed in the directory,** for staff too.
- **The notice about an invitation** is under "Private messages" for a group and under "Chat rooms" for a room, as planned, and a member who switched that kind off in the app gets the invitation without a notice.
- **Blocking a person declines the invitations they sent,** and a person can block someone who invited them even with no other contact. The plan said "can block the inviter"; it did not say what happens to the invitation.
- **A page opened at a found message doesn't follow new messages** until "Go to the newest messages" is pressed. Otherwise opening an old message in a long conversation would load everything after it.
- **The files module gained two things** the plan named only as "new code": storage can take a file from disk and give back a part of one, and a download answers a request for a part (`Range`), which a video player needs.
- **The browser test for a room by invitation hung once** on its first run, waiting three minutes for the search field of "Browse rooms", then passed on the retry and on every run after. The cause was not found.
- **More than three open chat windows of one person fight over the live connection.** A person may hold three; a fourth closes the oldest, which reconnects at once and closes another, and so on. While a window is being reconnected it can miss an edit or a reaction (new messages are fetched again on reconnecting; changes to old ones are not). Found because the browser tests left their windows open, so late in a full run one demo person had many: a reaction did not arrive once. The tests now close their windows when they end. **The product behaviour is unchanged** and is written into the known limitations; a real person with four chat tabs would see it.
- **The unit tests printed "a worker process has failed to exit gracefully" once.** It did not happen again in three runs. Not tracked down.
- **A script that edited files mangled three characters** (a known problem with this computer's shell and non-English text). Found by the lint check and corrected; the Hebrew texts were checked afterwards.
- **The running development database** got the demo group from `pnpm db:seed`, and test groups, rooms and files from the browser tests. `pnpm demo:reset` clears them.

### Open for the owner

1. ~~Checkpoint test of the demo~~ **Marked as good by the owner on 2026-10-05,** for M12 and M13.
2. ~~Merge the pull request~~ merged at the owner's request on 2026-10-05 (pull request #18, CI green).
3. ~~The wording of the Hebrew texts of M12 and M13~~ **Read by the owner on 2026-10-05;** no change was asked for.
4. **The legal review now also has to cover files and video in chat,** which are in the demo ahead of it.
5. Still open from M9: the "who" column of the readiness checklist in `DEPLOYMENT.md`.

## M14 Mobile app, part 1 (in progress, started 2026-10-05)

Plan: [`docs/plans/M14-mobile-app.md`](docs/plans/M14-mobile-app.md), approved by the owner on 2026-10-05 with the answers in its §11: a demo app on the owner's own phone (Android 16), seen through Expo Go; no push notifications in part 1; fingerprint or face when the app opens; the screens in the plan's order; signed in as long as on the web.

**This section is a running record; the milestone is not finished.** Every screen of part 1 is built and merged: checkpoints 2 to 4 with pull request #20 (2026-10-05), checkpoints 5 to 10 with pull request #21 (2026-10-06), both with green CI. What is left is checkpoint 12: the checklist on a real phone (`docs/demo/MOBILE_CHECKLIST.md`), what it turns up, and the demo.

### Built so far

- **Sign-in for an app, on the server** (checkpoint 2). With `client: "app"` a sign-in returns the refresh token in the answer and sets no cookie. The app refreshes and signs out at `/auth/app/refresh` and `/auth/app/logout`, with the token in the body. A refresh token is accepted only the way its own client presents it: a browser's token is refused outside its cookie, and the app's inside one, before anything is used up. Sessions say what started them and, for the app, what the phone is called; "my sessions" shows it. One migration, additions only.
- **The app's frame** (checkpoint 3): `apps/mobile`, Expo SDK 57 (React Native 0.86), using the shared API client, texts and design tokens. Hebrew and English, starting in the phone's language. A "Connection check" for the first test on a real phone.
- **Sign-in in the app** (checkpoint 4): email and password, then the authenticator code; the refresh token only in the phone's secure storage; the session restored when the app opens; the phone's fingerprint or face check, with a switch; sign out, and sign out everywhere.

- **Home and the membership card** (checkpoint 5, on the branch `feat/mobile-screens`, not in a pull request yet): three tabs (Home, Card, Me). Home shows who is signed in, the state of the membership and the number of unread notifications. The card shows the member's name, the kind of membership, until when, and the code that the site's verification page checks, renewed every four minutes. **Without a connection the card is shown as it last was, with its date and without a code,** because a kept code would be refused: the plan said "readable without a connection", and this is what that can honestly mean.
- **News** (checkpoint 6, same branch): a fourth tab. The list with a category choice and "Show more"; an item with its picture, text, files and references. Member-only items are shown as the API allows, as on the site. A file or a link opens in the phone's browser. The text of an item is drawn by a small reader written for the app (headings, paragraphs, lists, quotes, code, bold, italics, links); the site uses a library for this, and no library was added to the app.
- **Events** (checkpoint 7, same branch): a fifth tab. The list (upcoming or past, a category, "Show more"); an event with when and where, a map link, its text, registration (register, the waiting list, cancel), and the programme with speakers and materials; choosing sessions and saving them; "My schedule". Times are written in the event's own time zone.
- **Notifications** (checkpoint 8): the list, opened from Home; "read" and "read all"; the switches per kind, the same ones as the site. A notice about news or an event opens it inside the app; one about something the app does not have says it opens on the website.
- **Chat** (checkpoints 9 and 10): a Chat tab with the number of conversations that hold something unread. Private conversations, groups and rooms on one screen: reading and writing, live; replying, editing, deleting for everyone or for oneself; the six reactions; mentions in groups and rooms; forwarding; reporting a message, a person or a room; blocking; muting, pinning, marking unread, archiving. Files: a picture or a video from the phone, a picture from the camera, a PDF; pictures show in the message, other files open in the phone's browser. Starting a conversation, making a group and inviting to it, invitations (accept, decline, decline and block), browsing and joining rooms, chat settings and the list of blocked people. For whoever runs a group: rename, invite, remove, hand over. For a room's moderator: pin, remove a message, remove or ban its writer, lock and unlock, the list of bans. Announcements by a moderator.
- **The chat rules are shared with the site,** as the plan said: the module moved from the web app into the API client package (`@iua/api-client/chat`) with its 28 tests, and the site now reads it from there. Nothing in the site's behaviour changed.
- **The tabs are Home, News, Events, Chat, Me.** At the owner's request (2026-10-05) the membership card is not a tab: it opens from "Me" and from Home.

### Verified

- 54 sign-in integration tests pass (7 new); **the existing web sign-in suites pass unchanged.**
- 60 tests of the app's rules pass (the session against a pretend server and a pretend secure storage that records every write; the starting language; when the app locks again; the kept card; the reader of an item's text; file addresses and sizes; the registration panel in each state; where a notice leads; what may be done with a message, including that only a room's moderator gets the moderation tools; which files chat carries; the days of a ban; cutting the live stream into events).
- **On the owner's phone (Android 16, Expo Go, through the tunnel), reported by the owner on 2026-10-05:** the app opens; the connection check says "live updates arrive on this phone"; the page changes sides when the language is changed.
- The whole app builds for Android (`expo export`), and the app's server serves it through the tunnel. The demo server answers the list requests of News and Events. **Nothing else was exercised against a server from the app:** no registration, no notice, no message.
- The repository's format check, lint, type check and unit tests pass with the app included (12 packages). **The integration and browser suites were not run again** after the chat rules moved packages; the site type-checks and its unit tests pass, and CI runs the rest when the branch is pushed.

### Not verified

- **No screen built after sign-in has been seen on a phone:** not the card where it is now, News, Events, Notifications or Chat. They were written against the API's typed shapes and they compile; that is all that is known. The first run on the phone will turn up mistakes, and `docs/demo/MOBILE_CHECKLIST.md` is the list to go through.
- **In particular, never tried:** the keyboard over the box where a message is written; choosing a file, the camera and the upload; the live stream closing in the background and reopening; the list keeping its place when earlier messages are added; right-to-left layout of a conversation; TalkBack; the largest text size.
- **The app has no component tests.** The plan listed them (`jest-expo`, the React Native testing library): every screen rendering in both languages with a name on every control. They were not written. The rules behind the screens are tested; the screens themselves are not.
- **Of the first test on the phone, these were not reported:** staying signed in after the app is closed, the fingerprint or face check, the card and its code, and the phone showing among the sessions on the site. Whether the change of direction needed the app closed and opened was not said either.
- Nothing was tried on an iPhone, and nothing will be in part 1.

### Deviations and findings

- **Separate addresses for the app's refresh and sign-out,** not a field on the existing ones as the plan said. The browser's routes stay exactly as they were.
- **A security advisory came with Expo's tools** and was accepted by the owner on 2026-10-05: `node-forge` (GHSA-86w9-cpqp-85rv, no fixed version), reached only through Expo's command-line tool, which runs on the developer's computer and in CI and is not part of the app on the phone. Recorded in `pnpm-workspace.yaml`; remove when a fix exists. Two moderate advisories also arrived (`uuid`, `decode-uri-component`, both in Expo's tools or router); they don't fail the check.
- **Two of the project's own supply-chain rules blocked installs, and were not bypassed.** The 7-day rule: a batch of Expo libraries was 6 days old, so the release before it was installed for each. The trust check refused a sub-dependency of `expo-device`, so that library was left out; the phone's name comes from Android itself.
- **The app's rules are tested with the same test runner as the other packages,** not with the phone-component test tools the plan listed (`jest-expo`, the React Native testing library). Those are still to be added for the screens.
- **Passkeys don't work in the app,** as the plan said; the sign-in screen says so.
- **Not in the app's chat, though the site has it:** searching messages and jumping to an old message; the "active now" marks; copying a message's text with a button (the text can be selected); the list of invitations still waiting for an answer, and taking one back; inviting to a room by invitation; a video playing inside the app (it opens in the phone's browser). Each is on the site.
- **The conversations list shows the newest fifty,** and so does each rooms list; there is no "Show more" there yet.
- **A bug of checkpoint 5 was found and fixed:** Home read the number of unread notifications from the wrong field, so it would not have shown the number. Nobody had reported it; it was found when the notifications screen was written.
- **The camera and the photo library** are asked for only when the member presses "Camera" or "Photo or video", and only for what they pick, as the plan said. For an .apk the permission texts still have to be added to the app's configuration.
- **There is no ticket code for the door,** though the plan listed one. The project has no such code: attendance is recorded when a member scans the code shown at the venue (M5), which opens the site. The app says so to a registered member. Scanning inside the app would need the camera and a new library, and was not added.
- **"Add to my calendar" is offered in the app only for an event open to everyone.** The calendar file of a members-only event, and of "My schedule", needs the session, which a browser opened from the app does not have; the app says the file is on the website. Offering it in the app would need a library for saving and sharing files.
- **How a time range is written was made by hand** (a day, then two times), because not every phone has the browser's range formatting.
- **Checked route names were switched off in the app.** While the app's server runs, Expo rewrites a generated file wrongly (it lists ordinary source files as screens), and the type check then fails on correct code. CI never had this file, so nothing that CI checks is lost.
- **The demo's news list holds leftovers of the browser tests** ("Scheduled article 462278" and the like). How they got into the demo database was not looked into. They are fictional; `pnpm db:reset` followed by the seed removes them.
- **The phone reaches this computer through a tunnel, not over the Wi-Fi** (the plan's Amendment 1, asked for by the owner on 2026-10-05). Over the Wi-Fi, Expo Go never loaded the app, and the cause was not found. With Microsoft's dev tunnels, signed in with the owner's GitHub account, it loaded. While the tunnel runs, the demo server can be reached from the internet by anyone who has the address; it is stopped with the demo. The address changes each time the tunnel is started. The site is not behind the tunnel, so the card's code can't be checked from a second device this way.

### Open for the owner

1. **The checklist on the phone:** `docs/demo/MOBILE_CHECKLIST.md`, with a second person on the site for the chat part. Tell Claude what does not work; expect a list.
2. Pull request #19 (the plan alone) was closed on 2026-10-05 as redundant, at the owner's word.
3. **An .apk:** still wanted? It needs the decisions asked on 2026-10-05 (how it is built, and a fixed address for the server).

## M15 Mobile app, part 2: the rest of the site, without the admin area (in progress, started 2026-10-05)

Plan: [`docs/plans/M15-mobile-app-everything.md`](docs/plans/M15-mobile-app-everything.md), approved by the owner on 2026-10-05 with "1.b 2.approved 3.as proposed": the members' and visitors' parts, the three new libraries, the proposed order; **the admin area stays on the site.**

**This section is a running record; the milestone is not finished.** Steps 1 to 6 are built. Step 10 (component tests, the checklist on a phone, the demo) is not.

### Built so far

- **Education and exams** (step 1): the library with its filters, an item with its link, files, references and a course's lessons; exam practice one question at a time with the explanation of every option; "my results".
- **Guidelines, the member directory, search** (step 2): the lists with their filters; a guideline with its versions; a member's page with "write to this member"; one search whose results open inside the app.
- **The account** (step 3): the profile (every field, the photo, who may see each field, the choice to be listed in the directory); the membership and its history; account security (the authenticator, recovery codes, changing the password, the sessions, and "confirm it's you" before a sensitive change); the accessibility statement; a message from the association, opened from its notice.
- **The rest of chat** (step 4): searching messages in one thread or in all, and opening a thread at the message found; "active now" under a person's name; copying a message's text; invitations still waiting, and taking one back; inviting to a room by invitation.
- **The camera and files** (step 5): scanning the code shown at an event's venue records attendance; scanning a membership card's code checks it; "Add to my calendar" for every event and for "my schedule".
- **Visitors** (step 6): without signing in, the pages open to everyone; a forgotten password; opening an account. Signed in: applying for membership, the applications made, withdrawing one.
- **Where things are:** Home has a "More" card (scan a code, education, exam practice, guidelines, the directory, search); "Me" has the card, profile, membership, application, security, notification and chat settings, and the accessibility statement.

### Verified

- 79 tests of the app's rules pass (16 new in M15: the states of exam practice; which parts of a profile were changed; where a notice or a search result leads; what a scanned code means, including that a code that is not IUA Connect's is not followed; a message's "copy").
- The app type-checks, lints, and **the whole of it builds for Android** (`expo export`).
- **A test caught a real mistake before anyone saw it:** the address of exam practice on the site was read as the address of an education item.

### Not verified

- **The owner tried the app in Expo Go on 2026-10-05, after M15 was built, and reported "it runs fine".** Which screens and which lines of `docs/demo/MOBILE_CHECKLIST.md` were tried was not said, so no line of the checklist is marked as seen. Before that report, nothing of M15 had been run on a phone or against a server.
- **In particular, never tried:** the camera reading a code; saving a calendar file and the phone offering a calendar app; the authenticator opening from the app; the photo upload; "confirm it's you"; moving between a visitor's pages and signing in from there.
- **The integration and browser suites ran in CI for pull request #21** (2026-10-06, green), which was their first run after the chat rules moved packages. For M15 itself they run with its own pull request.

### Deviations and findings

- **Joining has no documents.** The plan said "the application, with documents picked from the phone". The site's application has none: a membership type, a hospital and department, and for some types a licence or certificate number. The app has the same.
- **Verifying an email address and choosing a new password after "forgot password" stay on the site.** Both open from a link in an email, and a link in an email opens the site. The app says so. Making such a link open the app needs the site to have real hosting with its own address, like passkeys.
- **Languages in the profile are named by the app's own texts** (twelve names in Hebrew and English were added). The site asks the browser for them, and the phone's engine can't be asked.
- **Setting up the authenticator shows no code to scan,** because the authenticator app is on the same phone. The app offers to open it, and shows the key to type.
- **Recovery codes can be copied, not downloaded as a file.**
- **Lists with many choices** (hospitals, departments) are a row that scrolls sideways, as everywhere in the app. With many hospitals this is slow to use; a searchable list would be better.
- **The plan's step 10 is not done:** no component tests were written (the plan promised them for the screens of both parts, with the libraries approved in M14 §6), and the demo has not happened.
- **Four packages were installed for the "three libraries" approved:** the camera, the clipboard, and the pair for files (saving and sharing), as the plan's table listed them. The project's own install rules let all four through.

### The fixed tunnel and the .apk (M14 amendment 2, asked for by the owner on 2026-10-05)

- **A tunnel with a fixed address exists and was checked:** the demo server and the app's own server answer through it. It is started with `start-tunnel.cmd` (see `apps/mobile/README.md`).
- **The .apk was built on GitHub on 2026-10-06, at the first real attempt** (the attempt of the day before was lost to an incident at GitHub and never ran). It is 57 MB, for phones with 64-bit ARM processors, built for Android 16 (target SDK 36; it installs from Android 7), signed with the debug key. The demo server's fixed address is inside it. **It has not been installed on a phone by anyone yet:** that it builds says nothing about whether it opens.
- **The checks on `main` after pull request #20, and those of pull request #21, were lost to the same incident** and were started again on 2026-10-06.

### Open for the owner

1. **Go through the checklist on the phone** (`docs/demo/MOBILE_CHECKLIST.md`) and tell Claude what does not work.
2. **Component tests:** still wanted before this is called finished? They are in the approved plan and not written.

## Next step

**The MVP (M0 to M9) is complete.** M9 was merged on 2026-10-03 (pull request #11).

**M10 (video and push connection points)** was merged on 2026-10-04 (pull request #12).

**M11 (private chat)** was merged on 2026-10-05 (pull request #14), and the owner's checkpoint test passed the same day.

**M12 (chat rooms)** was merged on 2026-10-05 (pull request #17), and the owner marked its checkpoint test as good the same day.

**M13 (groups, invitations, rooms by invitation, online status, forwarding, files and video)** was merged on 2026-10-05 (pull request #18). With it the owner's chat request (`chat.md.txt`) is built, apart from what was decided against. The owner marked its checkpoint test as good the same day, and read the Hebrew texts of M12 and M13.

**M14 (the mobile app, part 1)** and **M15 (part 2: the rest of the site, without the admin area)** are in progress: see their sections above. Their screens are built; the checklist on a real phone, component tests and the demo are left.

**After the pitch,** in the order proposed (each needs its own approved plan): have the server send public pages complete (`docs/demo/PERFORMANCE.md`); the readiness checklist in `DEPLOYMENT.md`, starting with the legal review (O6); then the Phase 2 list in `DEVELOPMENT_ROADMAP.md`.
