# Deployment

**Current state (end of the MVP, M9): not deployable to production, by design.** The demo runs on one Windows computer (`pnpm demo:reset`, then `pnpm dev`). Only demo adapters exist (local storage, console mailer, no-op malware scanner, in-memory rate limiting), and the API refuses to start with `NODE_ENV=production` while any of them is selected.

## Before any real deployment: the readiness checklist

Nothing below is done. Every line must be ticked before a real member's details are loaded. "Who" is a proposal for the project owner to confirm; "the association" means whoever the IUA names.

| #   | What                                                                                                                                                                                                                                                 | Who                                | Done |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- |
| 1   | Legal and privacy review by a professional (open item O6): terms of use, privacy notice, the wording of the directory consent, the security level under the Privacy Protection Regulations and the database definition document                      | The association, with a lawyer     | ☐    |
| 2   | An accessibility coordinator named on the accessibility statement, and an accessibility check by someone who uses a screen reader every day, or an outside audit (the owner's own NVDA check, 2026-10-03, found nothing)                             | The association; the project owner | ☐    |
| 3   | A named reviewer for medical content. (The ten sample exam questions were read by the project owner, a urologist, on 2 October 2026; the association may want its own reviewer to read them too)                                                     | The project owner; the association | ☐    |
| 4   | Who hosts it and under whose name; hosting in an Israeli region, TLS everywhere                                                                                                                                                                      | The association                    | ☐    |
| 5   | Production adapters written and tested: object storage, a mail provider with the association's sending domain, a virus scanner, a shared rate-limit store                                                                                            | Developer                          | ☐    |
| 6   | Secrets (signing keys, field-encryption keys, database passwords) in a secret manager, not in files                                                                                                                                                  | Developer                          | ☐    |
| 7   | Managed PostgreSQL 16+ with backups, point-in-time recovery and a restore that was actually tried                                                                                                                                                    | Developer                          | ☐    |
| 8   | Separate database roles as in development: an owner role for migrations (`prisma migrate deploy`) and an application role with the reduced privileges the migrations set. Set `iua.app_role` before migrating (see `tools/scripts/db-provision.mjs`) | Developer                          | ☐    |
| 9   | Monitoring, alerts on security events, log retention, and a written plan for a security incident (who is told, and when)                                                                                                                             | Developer; the association         | ☐    |
| 10  | A penetration test by an outside tester. The passive OWASP ZAP scan runs in CI since M9 (`docs/security/ZAP_BASELINE.md`); it does not replace one                                                                                                   | The association (commissions it)   | ☐    |
| 11  | A load test, and the page-speed work in `docs/demo/PERFORMANCE.md`                                                                                                                                                                                   | Developer                          | ☐    |
| 12  | Each administrator sets up their own two-step verification; the demo accounts and the shared demo authenticator entry do not exist in production (the seed and `pnpm demo:reset` refuse to run there)                                                | Developer; each administrator      | ☐    |
| 13  | How real members are brought in (applications, the CSV import, or the Medical Association's list), decided and tried on a copy first                                                                                                                 | The association; developer         | ☐    |

The open decisions behind lines 1, 4 and 13 are listed in `docs/demo/KNOWN_LIMITATIONS.md` §5.

## Build artefacts

- API: `pnpm --filter @iua/api build` → `apps/api/dist`, start with `node dist/main.js`. Run `prisma migrate deploy` with the owner connection before starting a new version.
- Web: `pnpm --filter @iua/web build` → `next start`. The web app renders per request (nonce-based CSP).
- Docker images are used in CI/deployment only (DEVELOPMENT_ROADMAP.md); none are required locally. Dockerfiles are added with the first staging environment.
