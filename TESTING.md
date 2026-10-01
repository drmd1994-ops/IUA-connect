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
