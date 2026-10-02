# IUA Connect — Project Status

_Last updated: 2026-10-02_

## Summary

| Item                      | Status                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                     | **M2 People & membership: merged 2026-09-30** (pull request #4). M1b Passkeys merged 2026-09-29 (PR #2; the manual Windows Hello check is deferred by the owner until the mobile app exists). M1 Identity merged (PR #1). M0 Foundations complete. **M3 Content core: merged 2026-10-01** (pull request #5). **M4 Content import: merged 2026-10-01** (pull request #6). **M5 Events: merged 2026-10-02** (pull request #7). **M6 Education: merged 2026-10-02** (pull request #8). **M7 Notifications and search: merged 2026-10-02** (pull request #9). Next: M8 Admin portal completion and dashboards; the plan was approved on 2026-10-02 and the build is under way on `feat/admin-dashboard`. |
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

## Next step

**M8 Admin portal completion and dashboards:** the plan [`docs/plans/M8-admin-dashboard.md`](docs/plans/M8-admin-dashboard.md) was approved by the owner on 2026-10-02; the build is under way on `feat/admin-dashboard`. The owner's checkpoint test of the demo (M1 to M7) and the review of the ten sample exam questions are still open.
