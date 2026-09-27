# Security policy

IUA Connect is a private pitch application running with **fictional demo data only**. The full threat model and controls are in [`SECURITY_MODEL.md`](SECURITY_MODEL.md).

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
