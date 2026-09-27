# IUA Connect — Development Roadmap

Incremental delivery (spec §49). Every milestone ends with **green CI, updated docs, and a short demo**. Nothing is marked done unless it meets spec §62.

## 1. Repository structure

```
iua-connect/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # guards, decorators, interceptors, filters, pagination, errors
│   │   │   ├── config/           # typed env schema (Zod), adapter selection
│   │   │   ├── infra/            # prisma, queue (pg-boss), storage, mailer, scanner, crypto, logger
│   │   │   └── modules/
│   │   │       ├── auth/ users/ profiles/ membership/ verification/ institutions/
│   │   │       ├── news/ events/ education/ guidelines/
│   │   │       ├── notifications/ search/ files/ audit/ admin/
│   │   │       └── payments/     # interface + schema only (D4)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   ├── seed/             # reference, demo, import layers
│   │   │   └── fixtures/iua-import/
│   │   └── test/                 # integration + e2e (supertest)
│   ├── web/                      # Next.js (public, member, /admin route group)
│   │   ├── src/app/[locale]/(public)/ (member)/ (admin)/admin/
│   │   ├── src/components/  src/features/  src/lib/
│   │   └── e2e/                  # Playwright
│   └── mobile/                   # created at M8 (Expo)
├── packages/
│   ├── shared/                   # Zod schemas, enums, permission keys, error codes
│   ├── api-client/               # generated from OpenAPI
│   ├── i18n/                     # he/, en/ (ar/, ru/ later)
│   ├── ui-tokens/                # colors, spacing, type scale
│   ├── eslint-config/  tsconfig/
├── tools/
│   ├── importer/                 # one-off urology.ima.org.il sample importer (D11)
│   └── scripts/                  # setup-dev (PowerShell + Node), db helpers
├── docs/
│   ├── product/ (MASTER_SPEC.md) architecture/ api/ security/ database/ ai/ deployment/
│   └── adr/
├── .github/
│   ├── workflows/ci.yml          # lint → typecheck → unit → integration → security → build
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── PROJECT_STATUS.md  ARCHITECTURE.md  PRODUCT_REQUIREMENTS.md  DATABASE_DESIGN.md
├── API_DESIGN.md  SECURITY_MODEL.md  DEVELOPMENT_ROADMAP.md
├── README.md  CONTRIBUTING.md  SECURITY.md  TESTING.md  DEPLOYMENT.md
├── .env.example  .editorconfig  .gitattributes (LF normalization for Windows)
├── pnpm-workspace.yaml  turbo.json  package.json
```

Spec §48 names `DATABASE.md`, `API.md` and `AI.md`, while spec §61 names `DATABASE_DESIGN.md` and `API_DESIGN.md`. The §61 files are kept as the design documents. The §48 names are added as short files that link to them, so both lists are satisfied without duplicating content.

## 2. Tooling

| Concern                 | Choice                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Package manager / tasks | pnpm workspaces + Turborepo                                                                              |
| Language                | TypeScript strict, Node.js 24 LTS                                                                        |
| API                     | NestJS 11, `nestjs-zod`, `@nestjs/swagger`, pino                                                         |
| Database                | PostgreSQL 16+, Prisma                                                                                   |
| Jobs                    | pg-boss                                                                                                  |
| Web                     | Next.js (App Router), Tailwind CSS v4, Radix primitives, `next-intl`                                     |
| Tests                   | Jest (API units), Vitest (web units), Supertest (integration), Playwright (e2e + accessibility with axe) |
| Quality                 | ESLint, Prettier, `eslint-plugin-boundaries`, Husky + lint-staged, commitlint (Conventional Commits)     |
| Security in CI          | gitleaks, Semgrep, `pnpm audit`                                                                          |
| CI                      | GitHub Actions on Linux with a Postgres service container                                                |

## 3. Milestones (MVP)

| #       | Milestone                           | Scope                                                                                                                                                                                                                                              | Exit criteria                                                                                                            |
| ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **M0**  | Foundations                         | Monorepo, configs, CI, API shell (health, error envelope, correlation IDs, logging, deny-by-default guard), Prisma baseline and migrations, audit module + append-only trigger, web shell with he/en and RTL, design tokens, Windows setup runbook | `pnpm setup:dev` works on the owner's Windows machine. CI green. A test proves that an undeclared route fails the build. |
| **M1**  | Identity                            | Register, email verification (console mailer), login, TOTP MFA, recovery codes, refresh rotation + reuse detection, sessions and devices, lockout, password reset, roles and permissions seed                                                      | Auth test suite passes, including reuse-detection and lockout tests                                                      |
| **M1b** | Passkeys                            | WebAuthn registration and login                                                                                                                                                                                                                    | Works in Chrome and Edge on Windows                                                                                      |
| **M2**  | People & membership                 | Profiles + visibility, institutions and directors, membership types, **verification workflow**, admin approval queue, membership history, CSV import (dry-run), digital card + public verify page                                                  | E2E test: register → director approves → admin approves → card verifies                                                  |
| **M3**  | Content core                        | Files module (local adapter, MIME sniffing, EXIF strip), News CMS workflow + translations + scheduled publish, guidelines (metadata + links), access tiers                                                                                         | Editor → reviewer → scheduled publish E2E test. Tier enforcement tests.                                                  |
| **M4**  | Content import                      | `tools/importer` for the curated sample (10–20 news and events, guideline and document metadata with links), fixtures committed, seed layer 3                                                                                                      | Import is repeatable and idempotent, keeps source attribution, and imports no directory data                             |
| **M5**  | Events                              | Events, sessions, speakers, registration, personal schedule, ICS export, QR attendance, email reminders                                                                                                                                            | Registration, attendance and ICS tests                                                                                   |
| **M6**  | Education                           | Library, types, levels, access tiers, external video links. **Stop and ask about video hosting (D8).**                                                                                                                                             | Tier enforcement tests. Video decision recorded in an ADR.                                                               |
| **M7**  | Notifications & search              | In-app + email notifications, preferences, broadcasts with two-admin approval, Hebrew-aware full-text search, opt-in directory                                                                                                                     | Anti-enumeration and rate-limit tests. Search relevance spot checks in Hebrew.                                           |
| **M8**  | Admin portal completion & dashboard | Admin dashboard, audit-log viewer, settings, member dashboard with "Coming soon" quick actions                                                                                                                                                     | Every admin route passes the 401/403/403/2xx test pattern                                                                |
| **M9**  | Pitch readiness                     | Accessibility audit (axe + manual NVDA), performance pass, OWASP ZAP baseline, demo script and seeded demo accounts per role, README polish                                                                                                        | Demo runs end to end on the owner's machine. Known limitations documented.                                               |

**After the MVP (pending the pitch outcome):** a real-data readiness gate (legal review, pen test, hosting in an Israeli region, backups and monitoring) → **Expo app** → Phase 2 (CME, community, cases, research, publications, jobs, mentorship, messaging, logbook with MedOps-compatible export, question bank) → Phase 3 (AI, calculators, journal club, conference mode) → governance / voting.

## 4. How work flows (ready for 2–3 developers)

- Trunk-based: short-lived branches `feat/<module>-<topic>`, PRs into `main`, squash merge.
- A PR must have CI green, updated docs, and tests. The template includes a security checklist (spec §60 step 10).
- Each module has an owner in `CODEOWNERS` once more developers join.
- ADRs for any decision with a real alternative.
- `PROJECT_STATUS.md` is updated at the end of every milestone.

## 5. Working with Claude Code on Windows

- The owner's Windows machine is the execution environment. The README includes a native Windows runbook covering PostgreSQL service checks, PATH, `psql`, PowerShell execution policy, and line endings.
- Every milestone starts by confirming the plan, and ends with the owner running `pnpm test` and `pnpm dev` locally.
- The local folder will be put under git in M0. The owner pushes it to `drmd1994-ops/IUA-connect`.
