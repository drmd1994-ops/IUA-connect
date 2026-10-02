# Testing

| Layer                  | Tool                                                               | Where                                                      | Command                      |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------- |
| API unit               | Jest + ts-jest (+ Supertest for pipeline tests without a database) | `apps/api/src/**/*.spec.ts`                                | `pnpm test`                  |
| API integration        | Jest + Supertest + real PostgreSQL                                 | `apps/api/test/**/*.int-spec.ts`                           | `pnpm test:integration`      |
| Packages and web units | Vitest                                                             | `packages/*/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` | `pnpm test`                  |
| E2E + accessibility    | Playwright + axe                                                   | `apps/web/e2e/**/*.spec.ts`                                | `pnpm --filter @iua/web e2e` |

## What the M0 suites prove

- **Deny by default** (`route-declarations.spec.ts`): every route in the real app declares `@Public()`, `@Authenticated()` or `@RequirePermission()`. A fixture proves the checker catches an undeclared route. `pipeline.spec.ts` proves the runtime guard: public → 200, no principal → 401, missing permission → 403, undeclared → 403 even for a principal holding every permission.
- **Error envelope:** unknown routes, validation failures (with field details, unknown keys rejected) and unexpected errors all return the envelope; internals never leak.
- **Correlation IDs:** created when missing, kept when well-formed, replaced when malformed, echoed in the header and the envelope.
- **Logging:** secrets are redacted; query strings are dropped.
- **Config:** production refuses demo adapters and development keys; error messages never contain secret values.
- **Audit log (integration):** entries are written and redacted; the app role has no UPDATE/DELETE/TRUNCATE privilege; the owner role is blocked by the trigger; `@Audited` routes record actor IP, target and correlation ID.
- **Database baseline (integration):** extensions present; `normalize_he` strips niqqud, folds final letters and splits on maqaf; the app role can't create tables or touch the migrations table; timestamps are stored in UTC (regression test for a Prisma adapter time-zone bug).
- **Health (integration):** ready reflects the database; 503 without leaking connection details.
- **i18n:** he and en have identical keys (UI, errors, emails); every API error code is translated. **Tokens:** WCAG AA contrast.

## What the M1 (Identity) suites prove

- **Crypto (unit):** Argon2id parameters and rehash detection; Unicode normalization of passwords; AES-256-GCM round trip, tamper and truncated-tag rejection, key rotation; keyed token hashes.
- **Tokens (unit):** EdDSA access tokens carry no roles; forged, expired, `alg: none` and wrong-key tokens are refused.
- **TOTP (unit):** RFC 6238 test vectors; recovery-code format and randomness.
- **Password policy (unit):** 12–128 characters counted in Unicode code points; breached, repetitive and email-derived passwords refused.
- **Schema (integration):** role catalogue seeded from code; case-insensitive lower-case emails; an unscoped role can be granted once; scope rules; cascades.
- **Sign-up and sign-in (integration):** verification required; existing addresses not revealed; unknown email and wrong password answer identically; lockout after 5 failures with doubling backoff and an email; new-device email; cookie attributes (HttpOnly, Secure, SameSite=Strict, path).
- **Refresh tokens (integration):** CSRF header required; rotation on every use; **reuse of an old token revokes the whole session** and is audited; idle sessions end.
- **Roles and MFA (integration):** admin roles get 4 h / 15 min sessions and no permissions until MFA; members 7 d / 3 d; TOTP enrolment, two-step sign-in, **code replay refused**, recovery codes single-use, challenge burned after 5 wrong codes; MFA can't be disabled while a role requires it.
- **Account security (integration):** re-authentication required after 5 minutes for sensitive changes; password change signs out other sessions; reset from the emailed link signs out everything and clears lockouts; sessions listed and revoked (404 for someone else's).
- **Rate limits (unit + integration):** 5 sign-ins per account per minute, 20 per IP, 5 registrations per IP per hour, 300 requests per IP per minute; 429 with Retry-After.
- **`pnpm admin:create` (integration):** creates a verified super admin who must enrol in MFA; idempotent; reserved example domains only; refuses production.
- **Hygiene (integration):** only hashes are stored; passwords and tokens never reach the audit log.
- **End to end (Playwright):** a member signs up, verifies from the outbox, signs in, enables MFA and signs in with a code (Hebrew); a forgotten password is reset (English); a new administrator is sent to MFA setup.
- **Accessibility (axe):** no WCAG 2.2 AA violations on any auth page, in Hebrew (RTL) and English (LTR).

## What the M1b (Passkeys) suites prove

- **Real ceremonies (integration):** `test/soft-authenticator.ts` is a software authenticator with a real P-256 key, producing genuine attestation and assertion signatures, so the server's WebAuthn verification runs for real (no mocks).
- **Registration:** user verification and discoverable credentials required; existing passkeys excluded; recent re-authentication required; another user's challenge or a missing user-verification flag is refused; only the public key is stored.
- **Sign-in:** a passkey alone signs in as an MFA session with the usual cookies; replayed assertions, other origins or relying parties, unknown passkeys and missing user verification are refused; a signature counter that goes backwards is refused and audited.
- **Rules:** passkeys satisfy MFA for administrative roles; the last factor can't be removed; the authenticator app can be turned off while a passkey remains; password sign-in reports that a passkey can complete it; re-authentication accepts only the user's own passkey, and passkey-only accounts must use it.
- **End to end (Playwright, Chromium and Edge):** with the browser's **virtual authenticator** (DevTools protocol), an administrator adds a passkey, the MFA banner disappears, and they sign in with the passkey alone — in English and Hebrew, with axe checks on the passkeys section.
- **Manual:** a real Windows Hello prompt in Chrome and Edge is checked by hand (automated tests can't use a real fingerprint reader).

## What the M3 (Content core) suites prove

- **Files:** the type comes from the content, never the name (renamed files, SVG and HTML are refused); size limits per type; images are re-encoded and lose their metadata (a JPEG with GPS data comes out without it); downloads need a signed, unexpired address and pass the access check.
- **Access tiers:** every tier against every membership state (unit), and every content read as six readers (integration): anonymous, signed in without a membership, active full member, active student, suspended, expired. Hidden items are left out of lists and answer 404 by link. Covered for news, guidelines and the files attached to an article.
- **News workflow:** the state machine and the four-eyes rule (unit); the full path including send-back with a comment, scheduling, the job publishing a due item once however often it runs, revisions of published items, and stale saves refused with `If-Match` (integration). History is append-only.
- **Article text:** the Markdown sanitiser keeps an allow-list and drops raw HTML, scripts, images and unsafe links (XSS vectors, unit).
- **Guidelines:** versions (newest first, unique names, never empty), language fallback, unsafe links refused, admin-only management.
- **Admin routes:** each has the anonymous 401, member 403 and admin-without-MFA 403 tests.
- **End to end (Playwright, `content.spec.ts`):** the exit test. An editor writes an article with an image in both languages and submits it; a reviewer schedules it; it appears on `/news` once the job has run (the test waits up to four minutes for it). A members-only article stays hidden from a visitor in the list and by link. An admin adds a guideline and a visitor opens it. Axe checks run on every page visited, and on the new public pages in both languages.

## What the M4 (Content import) suites prove

- **Importer (unit, `tools/importer`):** only the hand-picked kinds of page are accepted; the physician directory, sign-in pages, forms, other hosts, look-alike hosts and extra parameters are refused and never fetched. `robots.txt` is obeyed. Titles, dates and document links are read from pages written for the tests (not copies of the site). A page with an email address, a phone number or an ID-like number is kept out. News needs a reviewed title that names nobody.
- **Seed layer 3 (integration, fictional fixtures):** each item is created once however often the seed runs; imported news is public and keeps its original date and source address; documents keep the publisher's link and store no file; `pnpm import:remove` deletes exactly the imported items.
- **End to end:** a visitor opens an imported news item (source label and link) and an imported document (year only), with axe checks.
- **No test contacts the real site.**

## What the M5 (Events) suites prove

- **Rules (unit):** what makes an event publishable or cancellable; when registration is open; free places; overlapping sessions; when each reminder is due and when it is skipped; the calendar writer (escaping, lines folded at 75 octets without splitting a Hebrew letter, UTC times in both seasons, stable IDs, files that read back with the same values).
- **Events (integration):** event admins only (not members, not content editors); saves need the current version (`If-Match`); publishing says what is missing; cancelled events stay visible and closed to changes; lists and pages follow the access tiers for five kinds of reader.
- **Sessions and speakers:** sessions stay inside their event, also when the event's dates change; a speaker named in a session can't be deleted; materials and speaker photos are readable by whoever may see the event, and by nobody else.
- **Registration:** register, cancel and register again; other modes, drafts, cancelled and started events refuse; tiers are respected; **five people racing for one place: one gets it, four join the waiting list in order**; a cancellation or a larger capacity promotes the first person waiting and emails them; only registered people choose sessions.
- **Calendar files:** the event file and the personal schedule file are requested over HTTP and read back as calendars with the right times, IDs and status; hidden events give no file.
- **Attendance:** a scanned code records a registered member once; expired, altered and foreign codes and other kinds of token are refused; waiting people and strangers aren't recorded; marking by hand, voiding with a reason and recording again; the CSV export is safe to open in a spreadsheet; the table is append-only at the database level.
- **Reminders:** a week and a day before, once each however often the job runs; nothing for cancelled events, cancelled registrations or the waiting list; cancelling or moving an event emails everyone registered or waiting.
- **End to end (Playwright, `events.spec.ts`):** the exit test. An event admin creates an event with two sessions and publishes it; a demo member registers, picks a session, downloads the calendar file and opens the venue code's address; the admin sees the attendance. Axe checks run on every page visited.

## What the M6 (Education) suites prove

- **Rules (unit):** which review step each state allows and to whom; the person who submitted can't publish (four eyes); what each type needs before it can be submitted (a link or "recording not available yet", a file, a text, lessons); what makes an exam question complete (two to six options, exactly one right, every option explained, a summary); how a score is counted.
- **Library (integration):** editors write and submit, reviewers publish, send back with a comment, take down and archive; saves need the current version (`If-Match`); lists and pages follow the access tiers; a course lists its lessons in order and shows a lesson the reader can't open as locked, without its title; a course can't be a lesson; files are readable by whoever may read the item, and by nobody else; the history can't be changed at the database level.
- **Exam questions (integration):** the same review steps; a question is never asked before it is published; the right answer and the explanations are sent only after an answer; a visitor's answer isn't stored; a signed-in person's answers are stored, the first one counts, and only they can read their results; a question with two right options is refused; the history can't be changed at the database level.
- **End to end (Playwright, `education.spec.ts`):** the exit tests. An editor writes an article and a course, a reviewer publishes them and a visitor reads the course and its lesson in both languages. An editor writes an exam question, a reviewer corrects an explanation and publishes it, a visitor answers it and sees the right answer, why each option is right or wrong and the summary, and a signed-in reader finds the answer in their results. Axe checks run on every page visited.
- **The sample exam questions** in `apps/api/prisma/fixtures/demo-exam-questions.json` are loaded published since the owner reviewed them (2026-10-02). The tests don't depend on them: they write their own filler questions and find them by their text.

## What the M7 (Notifications and search) suites prove

- **Rules (unit):** the starting settings of every kind and how a stored switch overrides them; kinds that are always on; the broadcast steps and the two-admin rule; the unsubscribe link (expired, altered, another kind of token); how a query is prepared for search (vowel marks, final letters, word starts, one-letter prefixes, typed operators that are only text); stored links keep no host and no token.
- **Notices and switches (integration):** an action that emails a person also leaves a notice in the app; a switched-off channel is not used and the other one still is; "account and membership" can't be switched off; a person reads and marks only their own notices; a link that leaves the site is refused by the database.
- **New content:** a published item is announced once, also when it is published again; each person sees only announcements of items they may read, of kinds they switched on, made since their account exists; the daily summary lists each item once, only to people who asked, and is not sent when empty; its link switches off email for new content without signing in and touches nothing else.
- **Broadcasts:** the author can't approve or reject their own message, and the database refuses it too; a second admin can; the audience count the approver saw is the number of people reached; two approvals at once send it once; emails follow each member's switch, once, however often sending runs; only recipients can read a sent message; a sent message can't be changed or deleted, also at the database level.
- **Anti-enumeration (exit criterion):** in the directory, a member who is not listed, a suspended member, an expired member and an address that never existed give the same "not found" with the same body; people without an active membership get the same refusal for every address; private fields are never sent, searched or filtered on; visitors and non-members find no members through search.
- **Rate limits (exit criterion):** 30 directory requests a minute per person, 60 searches a minute per address, and a search that includes members counts toward the directory limit. They run against the real limits, like the sign-in limits.
- **Search and tiers:** hidden items appear in neither results nor counts, for a visitor, a signed-in non-member and members of two types; drafts are never found.
- **Hebrew relevance spot checks (exit criterion):** fictional items and queries with the expected first result: a title match above a text match, a word with and without its prefix, a word start, vowel marks in the text and in the query, final letters, a small typing mistake, and an English query.
- **End to end (Playwright, `notifications.spec.ts`):** a person switches email for guidelines on, an admin adds a guideline, the notice appears under the bell and opens the guideline, the summary email lists it and its link switches the email off; a broadcast written by one admin can't be approved by them, a second admin approves it, and a member reads it in the app and gets the email; a member joins the directory and finds another member by name in Hebrew, while a non-member is refused; a visitor searches in Hebrew from the header and opens a result. Axe checks run on every page visited.
- **The browser suite runs with the rate limits multiplied** (`RATE_LIMIT_SCALE`, set by the Playwright config), because it signs in dozens of times a minute from one address. The API refuses that setting in production.

## What the M8 (Admin portal and dashboards) suites prove

- **The admin route sweep (exit criterion, `admin-routes.int-spec.ts`):** the test reads every admin route from the running application (more than 80) and checks, for each one, that it declares a permission, refuses an anonymous caller with 401, refuses a signed-in member with 403, and refuses an administrator whose session has not completed two-step verification with 403. A route added later is covered without anyone adding a test. That an administrator in a verified session gets through is tested per screen, where the right request is known.
- **Rules (unit):** nobody disables themselves or changes their own roles; only a super admin acts on a super admin; the last super admin can't be disabled or lose the role; scoped and unknown roles are refused.
- **Accounts (integration):** the list and the account page carry no password, secret, hash or recovery code; a disabled account is signed out at once and can't sign in, and enabling restores it; a lock after failed sign-ins is ended; "sign out everywhere" ends every session; every action needs a reason and is audited with it.
- **Roles:** only a super admin gives and removes them; a role that needs two-step verification opens nothing until it is set up; removing a role ends the person's sessions.
- **Audit log:** filters by action, person, subject and dates; each look at the log is recorded with its filters; there is no route to change an entry, and the database refuses updates and deletes.
- **Dashboard:** each person gets only the parts they may act on; after adding a member, a suspended member, an item for review, a message for approval, an event and a disabled account, each number rises by exactly one.
- **Settings:** only a super admin reads and changes them; visitors get the contact details, and the notice only while it is switched on; values that don't fit are refused; the database accepts only the known keys.
- **End to end (Playwright, `admin-portal.spec.ts`):** an admin follows a dashboard tile to its list, disables an account (which is signed out and can't sign in), finds the action in the audit log with its reason, enables the account and gives it a role; a super admin switches a notice on and every page shows it, with the contact details in the footer; a member lands on their dashboard, where the "Coming soon" actions are neither links nor buttons. Axe checks run on every page visited.

## What the M9 (Pitch readiness) checks prove

- **Accessibility audit (Playwright + axe, `a11y-audit.spec.ts`):** no WCAG 2.2 AA violations on every page a signed-in member sees and on every admin page, in Hebrew and English; every control can be reached with the keyboard and shows where the focus is; the skip link, the account menu (Escape closes it and returns the focus) and an exam question work without a mouse; no page scrolls sideways at 320 px, which is what 400% zoom gives.
- **What automated checks can't prove:** how the site sounds. The screen-reader check is for a person, with `docs/demo/NVDA_CHECKLIST.md`.
- **Demo reset (unit, `demo-reset-rules.spec.ts`):** `pnpm demo:reset` accepts only the development database on this machine; it refuses production, the test database, any other database, a database on another machine, and missing or unreadable settings. The reset itself (drop, migrate, seed, two-step set-up) was run by hand on a scratch database; no automated test runs it.
- **Error format (unit, `packages/api-client`):** the hand-written check that recognises the API's error envelope in the browser agrees with the shared schema on valid and malformed bodies.
- **Security scan (CI job `zap`):** the OWASP ZAP baseline reads the running site and API passively on every change. A new warning fails the build unless it is listed with a reason (`docs/security/ZAP_BASELINE.md`). It is not a penetration test.
- **Performance** is measured by hand with Lighthouse, not in CI; the numbers are in `docs/demo/PERFORMANCE.md`.

## Integration test database

`pnpm setup:dev` creates `iua_connect_test`. The integration suite migrates and seeds it (reference layer) before running (`test/global-setup.ts`) and connects as the application role, exactly like the running API. Tests use unique IDs and don't depend on an empty database; the audit log can't be cleaned anyway (append-only), so if a reset is ever needed, drop `iua_connect_test` as the superuser and re-run `pnpm db:provision`.

In CI, a PostgreSQL 16 service container is provisioned with the same script (`pnpm db:provision`).

Most suites replace the rate-limit store with an unlimited one (they sign in far more often than one IP is allowed to); `auth-rate-limits.int-spec.ts` runs the real limits.

## End-to-end tests

```powershell
pnpm --filter @iua/web exec playwright install chromium   # once
pnpm --filter @iua/web e2e
```

- Locally the tests reuse `pnpm dev` if it's running (API on 4000, web on 3001), or start it. They run in **Chromium and Microsoft Edge**; Edge skips the journeys that create accounts.
- Emails are read from the `outbox/` folder, and administrators are created with `pnpm admin:create`, so the dev database must be set up (`pnpm setup:dev`).
- **Registration is limited to 5 per IP per hour**, and every local run comes from `localhost`. Each full run registers 2 accounts, so after two or three runs in an hour the sign-up test fails with "Too many attempts". Restart the API (`pnpm dev`) to reset the in-memory counters.
- In CI the e2e job runs `pnpm setup:dev` on a fresh database, builds, and runs Chromium against the production builds. On failure the Playwright report is attached to the run.

## Conventions

- Test behavior through public interfaces; a failing test names what broke.
- Never weaken a security test to make a change pass; add the missing declaration or policy instead.
- Coverage target: above 80% for services and policies (PRODUCT_REQUIREMENTS §4).
