# M1 — Identity: plan

- Status: **Proposed — awaiting owner approval** (no code is written before approval)
- Date: 2026-09-27
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M1. Design sources: `ARCHITECTURE.md` §3, §6, §9; `API_DESIGN.md` §3–5; `SECURITY_MODEL.md` §3; `DATABASE_DESIGN.md` §3 (identity tables); ADR 0002.

## 1. Goal and exit criteria

A person can register, verify their email, sign in, protect the account with an authenticator app, see and revoke their sessions, and reset a forgotten password — in Hebrew and English. Roles and permissions exist in the database, so later milestones can grant them.

**Exit criteria (roadmap):** the auth test suite passes, including refresh-token **reuse detection** and **lockout** tests. Plus the standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M1**

1. Registration, email verification, login, logout.
2. TOTP MFA (authenticator app) with recovery codes; **mandatory** for any admin or director role, optional for members.
3. Access tokens + rotating refresh tokens with reuse detection; sessions and devices; revoke one / all others.
4. Lockout with backoff; rate limits on auth endpoints.
5. Forgot / reset password; change password (re-authentication required).
6. New-device sign-in email.
7. Roles, permissions and their mapping, seeded from code (reference seed layer). The permission guard from M0 starts resolving real permissions.
8. A development-only CLI to create the first (fictional) super admin.
9. Web screens for all of the above (he/en, RTL/LTR, accessible).
10. Playwright end-to-end tests + axe accessibility checks (first use of `apps/web/e2e/`).

**Not in M1**

| Item                                                                     | Where                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| Passkeys (WebAuthn)                                                      | M1b                                              |
| Profiles, hospitals/departments, membership, verification workflow, card | M2                                               |
| Admin screens for users and roles                                        | M2 (approval queue) / M8                         |
| Demo accounts for every role                                             | M2 seed layer + M9                               |
| Real email delivery (SMTP)                                               | Later adapter; M1 uses the console/outbox mailer |

## 3. Decisions with proposed defaults

These follow the approved design documents. Items marked **(new)** are details the documents leave open; they are proposals the owner can change.

### Passwords

- Argon2id via `@node-rs/argon2` (prebuilt Windows binaries, no compiler needed). Parameters m = 19 456 KiB, t = 2, p = 1 (SECURITY_MODEL minimum); hashes are upgraded on login if parameters change later.
- Policy (NIST 800-63B style): **12–128 characters**, no composition rules, rejected if it appears in a bundled list of common/breached passwords or contains the email's local part.
- **(new)** Breached list: the 100 000 most common passwords from the SecLists project (MIT licence), bundled in the repo, checked offline. _Alternative:_ the Have I Been Pwned range API (k-anonymity, sends only a 5-character hash prefix) — better coverage but a network call to a third party. **Default: bundled list.**

### Tokens and sessions

- Access token: JWT signed with **EdDSA (Ed25519)** via `jose`, **10 minutes**, claims `sub`, `sid`, `mfa`, `iat`, `exp`, key ID in the header. Roles/permissions are **not** in the token; they are resolved per request (cached per session), so revocation is immediate.
- Refresh token: opaque 256-bit random value, only its SHA-256 hash stored, **rotated on every use**; using an already-used token revokes the **whole family** and the session, and is logged as a security event.
- **(new)** Lifetimes: member sessions **30 days absolute, 14 days idle**; sessions holding an admin/director role **8 hours absolute, 30 minutes idle** (ARCHITECTURE §9 "shorter sessions").
- Web storage: access token in memory only; refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`; CSRF double-submit (cookie + `X-CSRF-Token` header) on refresh and logout.
- **(new)** Same origin: the web app proxies `/api/v1/*` to the API (Next.js rewrite), so the browser only talks to `localhost:3001`. Cookies and CSP stay simple and CORS remains locked down.
- Keys: `pnpm setup:dev` generates the Ed25519 key pair, the field-encryption key and the token-hashing key into `.env` (never committed). In production they must come from a secret manager; the API refuses to start in production with development keys.

### MFA

- TOTP (RFC 6238) via `otpauth`: SHA-1, 6 digits, 30-second step (what every authenticator app supports), ±1 step tolerance, and **replay protection** (a code can't be used twice).
- Secret encrypted with AES-256-GCM (key ID stored for rotation). QR code rendered server-side as an SVG data URL (no third-party QR service).
- 10 single-use recovery codes, shown once, stored hashed.
- Mandatory MFA: a user holding any admin or director role who hasn't enrolled gets a **restricted session** that can only complete enrolment. Disabling MFA requires re-authentication and is blocked while such a role is held.

### Abuse protection

- Lockout: 5 consecutive failed sign-ins → locked 15 minutes, doubling on each further lock up to 24 hours; reset on success. The user gets an email when locked.
- Rate limits (API_DESIGN §5): login and MFA verify 5/min per account + 20/min per IP; register and forgot-password 5/hour per IP; global 300/min per IP. `@nestjs/throttler` behind the `RateLimitStore` interface, in-memory store (demo).
- No account enumeration: register and forgot-password always return 202 (an existing address gets an "someone tried to register with your email" message instead); login returns one generic error with equalized timing.

### Email (console/outbox mailer)

- Emails are rendered in the user's locale (he/en) and written to the console and to `outbox/` (git-ignored) as HTML files, so the demo can open verification and reset links without a mail server.
- Verification links: 24-hour expiry; reset links: 1 hour; both single-use and stored hashed.

### Roles and permissions (seeded from code)

| Role                                          | Permissions (M1 catalogue, extended by later milestones)                                                                                                                                                         | MFA      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| SUPER_ADMIN                                   | all, including `roles.manage`, `settings.manage`                                                                                                                                                                 | required |
| IUA_ADMIN                                     | `users.read`, `users.manage`, `membership.*`, `institutions.manage`, `news.*`, `events.manage`, `education.manage`, `guidelines.manage`, `files.upload`, `broadcasts.create`, `broadcasts.approve`, `audit.read` | required |
| CONTENT_EDITOR                                | `news.create`, `education.manage`, `files.upload`                                                                                                                                                                | required |
| EVENT_ADMIN                                   | `events.manage`, `files.upload`                                                                                                                                                                                  | required |
| DEPARTMENT_DIRECTOR (scoped to a department)  | `membership.approve.department`                                                                                                                                                                                  | required |
| RESEARCH_ADMIN, SUBSPECIALTY_ADMIN, CME_ADMIN | created now, permissions added with their Phase 2 features                                                                                                                                                       | required |

Members have no role (membership type is a separate axis, ADR 0004). The department scope column exists now; its foreign key is added when departments arrive in M2.

### First administrator

- **(new)** `pnpm admin:create` — development-only CLI that creates a **fictional** super admin (you choose the email; a strong password is generated and shown once). MFA enrolment is forced on first sign-in. Refuses to run in production.

## 4. Database changes (one migration, plus raw SQL where needed)

New tables (DATABASE_DESIGN §3): `users` (citext email, status, failed-login count, lock-until, locale), `roles`, `permissions`, `role_permissions`, `user_roles` (with scope), `sessions`, `refresh_tokens`, `devices`, `mfa_factors`, `recovery_codes`, `auth_tokens`. `audit_logs.actor_user_id` gets its foreign key to `users`. All tables snake_case, UUID v7 keys, timestamps; the app role gets normal access (no special restrictions beyond M0).

## 5. API (under `/api/v1`, from API_DESIGN §4)

`POST /auth/register`, `/auth/verify-email`, `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/password/change`, `/auth/reauthenticate`; `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `DELETE /auth/sessions`; `POST /auth/mfa/totp/setup`, `/auth/mfa/totp/confirm`, `DELETE /auth/mfa/{factorId}`, `POST /auth/mfa/recovery-codes`; `GET/PATCH /me` (email, locale, roles summary). Every route declares `@Public()` or `@RequirePermission()` (auth routes for the signed-in user use a new `@Authenticated()` declaration, which the deny-by-default test will accept). OpenAPI and the typed client are regenerated.

## 6. Web (he/en)

`/login`, `/login/mfa`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account/security` (password change, MFA setup with QR and recovery codes, sessions list with revoke). Header shows **Sign in** or an account menu. Forms: labelled fields, inline errors from the API's translated error keys, keyboard-only usable, screen-reader announcements.

## 7. Tests

- **Unit:** password policy, Argon2 wrapper, token service (sign/verify/expiry/key ID), refresh rotation and reuse detection, lockout backoff calculator, TOTP (known RFC 6238 test vectors, replay), recovery codes, permission resolution, rate-limit keys.
- **Integration (real PostgreSQL):** full register → verify → login → refresh → logout; **reuse detection revokes the family**; **lockout after 5 failures and unlock after the window**; enumeration-safe responses; CSRF required on refresh; MFA required for admin roles; re-auth required for sensitive changes; 429 on rate limits; secrets never appear in logs or audit rows; every auth event audited.
- **E2E (Playwright, Chrome + Edge):** register → open the verification link from `outbox/` → sign in → enable MFA → sign out → sign in with a TOTP code; password reset; axe accessibility checks on every auth page in he and en. CI gets an `e2e` job.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. Schema + migration + reference seed (roles/permissions); permission resolution in the guard.
2. Crypto and token services; register, verify email, login, refresh, logout.
3. Lockout, rate limits, enumeration hardening, new-device email.
4. MFA (TOTP, recovery codes, mandatory-for-roles), re-authentication, password change/reset, sessions.
5. `admin:create` CLI.
6. Web screens.
7. Playwright E2E + accessibility; CI e2e job; docs, `PROJECT_STATUS.md`, demo.

## 9. Risks

| Risk                                               | Mitigation                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security-critical code written in-house (ADR 0002) | Proven primitives only (Argon2id, `jose`, `otpauth`); tests for every control listed in SECURITY_MODEL; `/code-review` before closing the milestone |
| New dependencies vs. the 7-day release rule        | All proposed versions are already older than 7 days                                                                                                 |
| Scope is large                                     | Checkpoints above; each is usable and tested on its own                                                                                             |

## 10. Questions for the owner

1. **Web screens in M1** (recommended), or API only with screens later?
2. **Breached-password check:** bundled offline list (default) or the Have I Been Pwned API?
3. **Session lifetimes:** members 30 days / 14 days idle; admins 8 hours / 30 minutes idle — OK?
4. **Git workflow:** a branch `feat/auth-identity` with a pull request into `main` (CONTRIBUTING.md), or commit directly to `main` while you are the only developer? And may Claude push and open the PR?
