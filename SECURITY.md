# Security policy

IUA Connect is a private pitch application running with **fictional demo data only**. The full threat model and controls are in [`SECURITY_MODEL.md`](SECURITY_MODEL.md).

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner (GitHub: `@drmd1994-ops`), not in a public issue. Include the steps to reproduce and the affected commit. You'll get an acknowledgement within 7 days.

## Handling secrets

- Never commit secrets. `.env` is git-ignored; `.env.example` holds placeholders only.
- `pnpm setup:dev` generates random local database passwords into `.env`.
- gitleaks scans every commit in CI, and staged changes locally when installed.
- If a secret is committed: rotate it first, then remove it from history.

## Controls in place (M0)

- Deny-by-default authorization: a global guard plus a build-failing test for undeclared routes.
- Error envelope that never exposes internals; correlation IDs for tracing.
- Structured logs with redaction (tokens, passwords, cookies, certificate numbers); query strings are not logged.
- Append-only audit log: database trigger for every role, plus the application role lacks UPDATE/DELETE/TRUNCATE.
- Security headers (helmet on the API; nonce-based CSP, frame denial and related headers on the web app).
- The API refuses to start in production with demo adapters.
- CI: gitleaks, Semgrep, `pnpm audit --audit-level=high`.

Authentication, MFA and rate limiting arrive in M1.
