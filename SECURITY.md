# Security policy

Med Connect is a private pitch application running with **fictional demo data only**. The full threat model and controls are in [`SECURITY_MODEL.md`](SECURITY_MODEL.md).

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner (GitHub: `@drmd1994-ops`), not in a public issue. Include the steps to reproduce and the affected commit. You'll get an acknowledgement within 7 days.

## Handling secrets

- Never commit secrets. `.env` is git-ignored; `.env.example` holds placeholders only.
- `pnpm setup:dev` generates random local database passwords and keys (JWT signing, token hashing, field encryption) into `.env`. Keys carry a `dev-` key ID, which the API refuses in production.
- gitleaks scans every commit in CI, and staged changes locally when installed. `.gitleaks.toml` excepts exactly one file (the public breached-password list) with the reason recorded.
- If a secret is committed: rotate it first, then remove it from history.

## Controls in place (M0)

- Deny-by-default authorization: a global guard plus a build-failing test for undeclared routes.
- Error envelope that never exposes internals; correlation IDs for tracing.
- Structured logs with redaction (tokens, passwords, cookies, certificate numbers); query strings are not logged.
- Append-only audit log: database trigger for every role, plus the application role lacks UPDATE/DELETE/TRUNCATE.
- Security headers (helmet on the API; nonce-based CSP, frame denial and related headers on the web app).
- The API refuses to start in production with demo adapters.
- CI: gitleaks, Semgrep, `pnpm audit --audit-level=high`; GitHub Actions pinned to commit SHAs.
- **Accepted audit exception (2026-10-03):** `GHSA-vfj7-8cjw-p6xm` in `braces` (a crash on deeply nested patterns), for which no fixed version exists. It is reached only by the lint tooling, on patterns from this repository's own configuration, never on a visitor's input. Listed with its reason in `pnpm-workspace.yaml` (`auditConfig`); remove the entry when a fixed version is published. Every other advisory still fails the job.
- **Accepted audit exceptions (2026-10-24, by the owner):**
  - `GHSA-27r3-jxmh-p828` (body-parser) and `GHSA-q7qp-rjg7-q26m` (multer): requests that can slow the API down. Their fixed versions were published on 2026-10-22, younger than the 7-day rule. **Accepted until 2026-10-29**, when both are updated and the entries removed.
  - `GHSA-mrhx-c7xc-m3w5` (zod): the project's own zod is updated to 4.6.6. The Expo developer tool uses zod 3, for which no fix exists, and it is not part of the phone app, the API or the site. Remove when Expo moves to a fixed zod.
  - Fixed the same day: undici 7.30.1 (`GHSA-xjj6-f33q-929c`), pinned for the unused importer tool.
- Supply chain: pnpm refuses packages published less than 7 days ago, non-registry transitive sources and publisher-trust downgrades.

## Controls added in M1 (Identity)

- **Passwords:** Argon2id (m=19 MiB, t=2, p=1), 12–128 characters, checked against 72 000 known breached passwords, never logged.
- **Tokens:** EdDSA access tokens (10 minutes, no roles inside); opaque refresh tokens stored as keyed hashes, rotated on every use, **reuse revokes the session**; HttpOnly + Secure + SameSite=Strict cookie scoped to `/api/v1/auth`; CSRF double-submit on refresh and sign-out.
- **Sessions:** members 7 days (3 idle); admin roles 4 hours (15 minutes idle); listed and revocable by the user; password change or reset signs other sessions out.
- **MFA:** TOTP with replay protection and single-use recovery codes; secrets encrypted with AES-256-GCM; mandatory for every administrative role, whose permissions apply only in an MFA session.
- **Re-authentication** within 5 minutes before MFA or recovery-code changes.
- **Abuse:** lockout after 5 failures (15 minutes, doubling to 24 hours); rate limits per account and per IP; no account enumeration on sign-up, sign-in, resend or reset.
- **Notifications:** emails for new-device sign-ins, lockouts and password changes.
- **Audit:** every sign-in, failure, lockout, MFA change, password change, session revocation and refresh-token reuse.
- **Development-only admin creation** (`pnpm admin:create`): fictional reserved domains only; refuses production.

## Controls added in M1b (Passkeys)

- **WebAuthn passkeys** (`@simplewebauthn/server`): phishing-resistant (bound to the site's domain); only the public key is stored.
- **User verification required** (fingerprint, face or PIN) on every ceremony, so a passkey counts as two factors: it can sign in on its own and satisfies the MFA requirement of administrative roles (owner decisions 2026-09-29).
- **Single-use, 5-minute challenges** stored as keyed hashes; replayed or foreign-origin responses are refused.
- **Cloned-key signal:** a signature counter that goes backwards is refused and audited.
- **Last factor protected:** a role that requires MFA can't remove its last passkey or authenticator app.
- **Re-authentication** with a passkey; accounts with passkeys but no authenticator app can't re-authenticate with the password alone.
- The relying-party ID must be the real domain in production (the API refuses `localhost`).
