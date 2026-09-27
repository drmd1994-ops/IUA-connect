# Deployment

**Current state (M0): not deployable to production, by design.** Only demo adapters exist (local storage, console mailer, no-op malware scanner, in-memory rate limiting), and the API refuses to start with `NODE_ENV=production` while any of them is selected.

## Before any real deployment (real-data readiness gate, after the MVP)

From `SECURITY_MODEL.md` and `DEVELOPMENT_ROADMAP.md`:

1. Professional legal and privacy review (open item O6), including the Privacy Protection Regulations security level and database definition document.
2. Production adapters implemented and tested: S3-compatible storage, SMTP/provider mailer, ClamAV scanner, Redis rate limiting (optional).
3. Secrets in a secret manager (JWT signing keys, field-encryption keys, database credentials), not in files.
4. Hosting in an Israeli region; TLS everywhere; managed PostgreSQL 16+ with backups, point-in-time recovery and restore drills.
5. Separate database roles as in development: an owner role for migrations (`prisma migrate deploy`) and an application role with the reduced privileges the migrations set. Set the database setting `iua.app_role` before migrating (see `tools/scripts/db-provision.mjs`).
6. Monitoring, alerting on security events, log retention.
7. Penetration test and OWASP ZAP baseline (M9).

## Build artefacts

- API: `pnpm --filter @iua/api build` → `apps/api/dist`, start with `node dist/main.js`. Run `prisma migrate deploy` with the owner connection before starting a new version.
- Web: `pnpm --filter @iua/web build` → `next start`. The web app renders per request (nonce-based CSP).
- Docker images are used in CI/deployment only (DEVELOPMENT_ROADMAP.md); none are required locally. Dockerfiles are added with the first staging environment.
