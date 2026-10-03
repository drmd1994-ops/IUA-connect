# IUA Connect — Architecture

## 1. Style

A **modular monolith**: one NestJS API process and one PostgreSQL database. Modules have strict boundaries:

- Each module owns its tables. Other modules reach its data only through its exported service, never by querying its tables through Prisma.
- Modules communicate through service calls or domain events (an in-process event bus, with pg-boss for anything asynchronous).
- A module can later be extracted into its own service without rewriting callers. Voting (spec §29) is the most likely first candidate.

Why not microservices: one developer, demo mode, and a Windows-native environment. Microservices would add operational cost with no benefit at this stage.

## 2. System context

```
                ┌───────────────────────────────┐
  Browser ─────▶│  apps/web  (Next.js)          │
                │  • public site                │
                │  • member area                │
                │  • /admin route group         │
                └──────────────┬────────────────┘
                               │ HTTPS  /api/v1  (JSON)
  Expo app (later) ────────────┤
                               ▼
                ┌───────────────────────────────┐
                │  apps/api  (NestJS)           │
                │  guards → interceptors → mods │
                └───┬─────────┬──────────┬──────┘
                    │         │          │
              PostgreSQL   Storage    Mail/Push
              (+ pg-boss)  adapter    adapters
                           (disk→S3)  (console→SMTP/FCM)
```

## 3. Request pipeline (API)

1. **Correlation ID middleware.** Accepts or creates `x-correlation-id` and binds it to the logger context.
2. **Security headers** (helmet) and CORS restricted to known origins.
3. **Rate limiter.** A global limit, plus stricter limits on auth endpoints. Storage is in memory; the Redis adapter comes later.
4. **Auth guard.** Verifies the access token (short-lived JWT) and loads the session. Checks the session isn't revoked.
5. **Permission guard.** `@RequirePermission('news.publish')` checks against permissions resolved from the user's roles. Resource-level checks (e.g. "own profile", "director of this department") live in services through **policies**.
6. **Validation pipe.** Zod schemas from `packages/shared`, shared with the web client.
7. **Controller → service → repository.**
8. **Audit interceptor.** Records mutating actions: who, what, target, before/after digest, IP, correlation ID.
9. **Exception filter.** Returns predictable error envelopes and never exposes raw internals (spec §55).

## 4. Module map

| Module                                                                                             | MVP          | Notes                                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Auth                                                                                               | ✅           | Registration, login, MFA (TOTP; passkeys in M1b), refresh rotation, sessions, devices |
| Users                                                                                              | ✅           | Account lifecycle, roles                                                              |
| Profiles                                                                                           | ✅           | Profile data plus per-field visibility                                                |
| Membership                                                                                         | ✅           | Types, status, history, **verification workflow**, digital card                       |
| Institutions                                                                                       | ✅           | Hospitals, departments, directors (supports verification)                             |
| News                                                                                               | ✅           | CMS workflow, translations, access tier                                               |
| Guidelines | ✅ | Links to official guidelines with versions; no files copied |
| Events                                                                                             | ✅           | Events, sessions, speakers, registration, attendance QR, ICS export                   |
| Education | ✅ | Content library, courses, levels, access tier, and exam-question practice (one question at a time). A video is a link to its host. |
| Notifications                                                                                      | ✅           | In-app and email. Push later. Per-user preferences.                                   |
| Search                                                                                             | ✅           | Postgres full-text search behind a `SearchProvider` interface                         |
| Files                                                                                              | ✅           | Upload, validation, storage adapter, signed download URLs, scan status                |
| Audit                                                                                              | ✅           | Append-only log                                                                       |
| Admin                                                                                              | ✅           | Aggregated admin endpoints (dashboard, approvals queue)                               |
| Import                                                                                             | ✅ (tooling) | One-off CLI to import the curated sample from urology.ima.org.il into seed data       |
| Payments | ⛔ not built | Membership has a `payment_status` field set by hand. No payment tables or provider interface yet (planned as "schema plus interface"; not done). |
| Community, Cases, CME, Research, Publications, Jobs, Mentorship, Messaging, Logbook, Question Bank | Phase 2      |                                                                                       |
| AI, Calculators, Journal Club, Conference Mode+                                                    | Phase 3      |                                                                                       |
| Governance / Voting                                                                                | Later        | Voting via an external provider, pending legal review                                 |

## 5. Pluggable infrastructure (adapters)

Every external dependency sits behind an interface with a demo implementation that runs on Windows with nothing else installed.

| Interface          | Demo implementation                                             | Later                                        |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| `IdentityProvider` | Local (Argon2id, TOTP, passkeys, JWT). **Not a separate interface in the code**: sign-in lives in the Auth module | External OIDC (Keycloak, Entra, etc.) |
| `JobQueue`         | pg-boss (Postgres)                                              | Keep, or BullMQ + Redis                      |
| `RateLimitStore`   | In memory                                                       | Redis                                        |
| `ObjectStorage`    | Local disk (`./storage`, outside the web root)                  | S3-compatible                                |
| `MalwareScanner`   | `NoopScanner`. Marks files `UNSCANNED`; only admins can upload. | ClamAV (native Windows or Linux)             |
| `Mailer`           | Console / file outbox                                           | SMTP / provider                              |
| `PushProvider` | `DisabledPushProvider`: sends nothing. The notifier hands it each notice in the app (M10). No devices are registered and there is no push switch yet | Expo Push / FCM / APNs, with the mobile app |
| `VideoProvider` | `LinkVideoProvider`: a recording is a link to where it is hosted (ADR 0008). Education asks it what may be attached and how it is played (M10) | A hosted video service, chosen after the pitch |
| `PaymentProvider` | **Not built** (no code yet) | Israeli payment processor with hosted fields |
| `MembershipSource` | Manual (admin screens and CSV import). **Not a separate interface in the code** | IMA integration |
| `SearchProvider`   | Postgres full-text search                                       | OpenSearch                                   |

The eight interfaces that exist in the code are `JobQueue`, `RateLimitStore`, `ObjectStorage`, `MalwareScanner`, `Mailer`, `SearchProvider`, and since M10 `VideoProvider` and `PushProvider`. The remaining rows (`IdentityProvider`, `PaymentProvider`, `MembershipSource`) were planned as "interface only" and were not written; each is added with the feature that needs it.

Adapters are selected with environment variables and validated at startup. The app refuses to start with an invalid combination, e.g. `NoopScanner` while `NODE_ENV=production`.

## 6. Authorization model

Membership category and administrative role are **separate axes**:

- **Membership type** (FULL_MEMBER, NON_FULL_MEMBER, RESIDENT, STUDENT, HONORARY_MEMBER) describes what the person _is_. It is stored on `memberships`.
- **Roles** (SUPER_ADMIN, IUA_ADMIN, CONTENT_EDITOR, EVENT_ADMIN, RESEARCH_ADMIN, SUBSPECIALTY_ADMIN, CME_ADMIN, **DEPARTMENT_DIRECTOR**) describe what the person may _do_. They are stored on `user_roles`, optionally scoped, e.g. DEPARTMENT_DIRECTOR scoped to one department.
- **GUEST** means unauthenticated. It is not stored.
- **Permissions** are granular strings (`news.create`, `membership.approve.department`, `membership.approve.final`, ...), mapped to roles in the database and seeded from code.
- Access tiers on content are evaluated against membership type and status.

## 7. Verification workflow (D3)

```
REGISTERED ──(email verified)──▶ PENDING_DIRECTOR ──(director approves)──▶ PENDING_ADMIN ──(IUA admin approves)──▶ ACTIVE
                                        │                                         │
                                        └──(rejects, with reason)──▶ REJECTED ◀───┘
```

- The registrant selects a hospital and department. The request goes to every user holding DEPARTMENT_DIRECTOR scoped to that department.
- Specialists enter a specialist certificate number (format-validated only; there's no live registry check). Residents: see open item O3.
- If a department has no director, the request goes straight to the IUA admin queue, flagged.
- Every transition is audited. Notifications go out by email and in-app.

## 8. Internationalization

- Locales: `he` (default, RTL) and `en`. `ar` (RTL) and `ru` are ready to be added.
- UI strings come from `packages/i18n/<locale>/*.json`. Lint rules block hard-coded JSX text.
- Content translations live in a **per-entity translations table** (`news_translations(news_id, locale, title, summary, body)`), so adding a locale needs no schema change.
- Layout uses CSS logical properties (`ms-`, `me-`, `ps-`, `pe-` in Tailwind), and `dir` is set per locale. Dates and numbers use `Intl`.

## 9. Web application

- Next.js App Router with locale-prefixed routes (`/he/...`, `/en/...`).
- The frontend talks to the API only through `packages/api-client`, which is generated from the OpenAPI spec.
- Auth on web:
  - The access token stays in memory.
  - The refresh token is an `HttpOnly; Secure; SameSite=Strict` cookie scoped to the refresh path.
  - The refresh endpoint is CSRF-protected with the double-submit pattern.
- `/admin` is a route group with its own layout. Server-side checks require an admin role **and** MFA completed in the current session. Sessions there are shorter.
- UI: Tailwind plus a small in-house component library (design tokens in `packages/ui-tokens`), accessible primitives via Radix, and IBM Plex Sans / Plex Sans Hebrew typography.

## 10. Observability

- Structured JSON logs (pino) with a redaction list: passwords, tokens, certificate numbers, email addresses (partially masked), request bodies on auth routes.
- Health endpoints: `/health/live` and `/health/ready` (checks the database and queue).
- Metrics hooks (Prometheus format) exist but are unused in demo mode.

## 11. Local environment (Windows, native)

Required: Node.js 24 LTS, pnpm, Git, PostgreSQL 16+ (already installed).
Optional later: Redis-compatible server (Memurai), ClamAV for Windows.

`pnpm setup:dev` checks prerequisites, creates `.env` from `.env.example`, runs migrations and seeds. Continuous integration runs on Linux (GitHub Actions) with a Postgres service container. Docker is used in CI and deployment only, never required locally.

## 12. Architecture decision records

Each decision above that has a real alternative gets an ADR in `docs/adr/`. The first set:

- 0001 Modular monolith
- 0002 In-house auth behind `IdentityProvider`
- 0003 pg-boss instead of Redis for demo
- 0004 Membership type vs. role separation
- 0005 Translations table for content
- 0006 Admin as route group
- 0007 Web-first delivery
