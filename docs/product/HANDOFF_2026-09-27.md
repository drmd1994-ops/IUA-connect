# HANDOFF — IUA Connect (from planning session, 2026-09-27)

You are picking up a project that was planned in a Claude chat session. This file is the full context you need. Read it, then read the planning documents it references, **before doing anything**.

> **This file describes the starting point (27 September 2026) and is kept as written.** Since then milestones M0 to M9 have been built: the repository exists and is on GitHub, the open questions O1 to O5 below were answered, and section 6 ("Next step: M0") is done. For where things stand **now**, read `PROJECT_STATUS.md` (each milestone has its own section, with what was delivered, what was verified and what is open for the owner). For showing the demo, read `docs/demo/DEMO_SCRIPT.md` and `docs/demo/KNOWN_LIMITATIONS.md`. The owner's decisions in section 4 and the working rules in section 7 still hold; every milestone also has an approved plan in `docs/plans/`.

## 1. What this project is

**IUA Connect — "The Digital Home of Israeli Urology."** A web platform (mobile later) for the Israeli Urological Association: membership, news, events, education, notifications, search and an admin portal in the MVP, growing later into CME, community, cases, research, messaging, AI and more.

- Full original specification (62 sections): `docs/product/MASTER_SPEC.md`. It is the source of truth for intent. The planning docs narrow it to the MVP.
- **Owner:** a urology surgeon, the sole developer for now; 2–3 developers are planned.
- **Status:** a **private app to be pitched to the IUA**. Not endorsed by or affiliated with IUA or the Israeli Medical Association (IMA). **Demo mode: fictional people only. No real personal data** until legal review.

## 2. Where things are

| Item                                  | Location                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project folder (Windows)              | `C:\Users\PC\Desktop\IUA CONNECT`                                                                                                                                                         |
| GitHub remote                         | `https://github.com/drmd1994-ops/IUA-connect.git` (private; the owner pushes manually). Not yet linked to the local folder. The local folder has **no git repo yet**; M0 runs `git init`. |
| Existing IUA website (content source) | https://urology.ima.org.il/                                                                                                                                                               |

When the planning session inspected it, the folder was **empty**: no code to preserve. It now contains only the planning documents below and `docs/product/MASTER_SPEC.md`.

## 3. Planning documents (read all before coding)

| File                      | Contents                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT_STATUS.md`       | Decisions D1–D15, open items O1–O6, next step                                                                                     |
| `ARCHITECTURE.md`         | Modular monolith, request pipeline, module map, pluggable adapters, auth model, verification workflow, i18n, web app, Windows env |
| `PRODUCT_REQUIREMENTS.md` | MVP features and acceptance criteria, out-of-scope list                                                                           |
| `DATABASE_DESIGN.md`      | Conventions, MVP tables, indexes, Hebrew search, seeding layers, retention                                                        |
| `API_DESIGN.md`           | `/api/v1` conventions, error envelope, auth flow, endpoint catalogue, rate limits                                                 |
| `SECURITY_MODEL.md`       | Threat model, controls, regulatory notes, security testing, incident response                                                     |
| `DEVELOPMENT_ROADMAP.md`  | Repo structure, tooling, milestones M0–M9, workflow                                                                               |

## 4. Decisions made by the owner (do not re-litigate without asking)

1. **Client:** a private pitch app. Demo data only.
2. **Membership source of truth:** IMA. The MVP manages members **manually** (admin screens + CSV import). No IMA integration yet; there's a `MembershipSource` interface for it.
3. **Verification:** the registrant provides a **specialist certificate number** → their **department director** approves (DEPARTMENT_DIRECTOR is a role scoped to a department in the registry) → an **IUA admin** gives final approval. Admins create and verify directors. A department with no director goes straight to the admin queue, flagged.
4. **Payments:** not in the MVP. Build the schema (`payments`, `invoices`, `payment_status` on membership) plus a `PaymentProvider` interface only.
5. **Web first:** a responsive Next.js app (public + member + `/admin`). The Expo app comes **after** the API is stable (M8+).
6. **Languages:** **Hebrew (default, RTL) and English** at launch. Architecture ready for **Arabic and Russian** (translation keys; a per-entity translations table for content).
7. **Content access tiers:** build the infrastructure (PUBLIC / MEMBERS / TYPES). **Everything defaults to PUBLIC**; admins can change it per item.
8. **Video hosting:** interface only. **Stop and ask the owner when you reach the video milestone (M6).**
9. **Member directory:** **opt-in**, hidden by default, with per-field visibility defaulting to PRIVATE.
10. **Surgical logbook (Phase 2):** independent of the owner's other project, MedOps Registry. Separate codebase, but reuse its patterns, and design an export format for possible future integration.
11. **Dev environment:** **Windows, native, no Docker locally.** PostgreSQL is installed natively. Docker only in CI/deployment.
12. **Content import from urology.ima.org.il:** a curated **sample** of 10–20 recent news and event items (keep the original date and a source link with attribution), plus guideline and document **metadata with links** (don't copy PDFs). **Do NOT import the physician directory.** The site footer says content rights belong to IMA; recommend getting permission before showing it in the pitch.
13. **Team readiness:** monorepo, CI, shared configs, ADRs, CONTRIBUTING, PR template, CODEOWNERS.
14. **Auth:** in-house in NestJS (Argon2id, TOTP MFA, rotating refresh tokens with reuse detection, sessions/devices) behind an `IdentityProvider` interface. External OIDC (e.g. Keycloak) is possible later. Passkeys in M1b.
15. **Admin portal:** a **route group inside the web app** (`/admin`), requiring MFA with shorter sessions. It can be split into its own app later.
16. **Demo infrastructure:** **PostgreSQL only.** pg-boss for jobs, in-memory rate limiting, a local-disk storage adapter, a no-op malware scanner (uploads admin-only and marked UNSCANNED), a console mailer. Redis, S3, ClamAV and SMTP plug in via adapters later. The app must **refuse to start in production** with demo adapters.

Key architecture choice to respect: **membership type ≠ role.** FULL_MEMBER, RESIDENT, etc. are membership types; IUA_ADMIN, CONTENT_EDITOR, DEPARTMENT_DIRECTOR, etc. are (optionally scoped) roles; GUEST means unauthenticated.

## 5. Open questions (ask the owner when relevant)

- **O1:** Approval of the planning documents. **Not yet given at handoff. Confirm before starting M0.**
- **O2:** Git: `git init` locally in M0, then connect to the GitHub remote. The owner pushes.
- **O3:** Specialist certificate number format rules. **Residents have no specialist certificate yet**: which identifier do they provide (medical license number?), and do students need director approval? Needed by M2.
- **O4:** Permission from IUA/IMA to show the imported content in the pitch. Needed before the pitch.
- **O5:** Video hosting provider. Needed at M6.
- **O6:** Professional legal review. Needed before any real data.

## 6. Next step: M0 Foundations (after the owner approves)

Per `DEVELOPMENT_ROADMAP.md`:

- pnpm + Turborepo monorepo (`apps/api`, `apps/web`, `packages/*`, `tools/*`, `docs/*`)
- NestJS API shell: health endpoints, error envelope, correlation IDs, pino with redaction, **deny-by-default permission guard** plus a test that fails if any route declares neither `@Public()` nor `@RequirePermission()`
- Prisma baseline and migrations. Audit module with an **append-only trigger**.
- Next.js web shell with `/he` and `/en`, RTL/LTR, design tokens (IBM Plex Sans / Plex Sans Hebrew)
- `.env.example`, `.gitattributes` (LF), ESLint/Prettier/boundaries, Husky, commitlint, gitleaks
- GitHub Actions CI: lint → typecheck → unit → integration (Postgres service) → security → build
- Root docs: README with a **native Windows setup runbook** (PostgreSQL service check, PATH, `psql`, PowerShell execution policy, line endings), CONTRIBUTING, SECURITY, TESTING, DEPLOYMENT, plus short `DATABASE.md` / `API.md` / `AI.md` pointing to the design docs.
- ADRs 0001–0007 (listed in ARCHITECTURE §12)

Exit criteria: `pnpm setup:dev` works on the owner's Windows machine, CI is green, and the deny-by-default test passes.

## 7. Working rules (from the spec and the owner)

- **Plan before implementing. Wait for approval** before large implementation steps. Work milestone by milestone.
- **Never destroy existing code or overwrite files without examining them first.**
- Per feature (spec §60): explain the architecture briefly → backend → database → API → frontend → tests → run tests → fix → docs → security check.
- **No placeholder functionality disguised as complete.** Features not yet built are shown as disabled "Coming soon"; interfaces for unbuilt capabilities are documented as such.
- Definition of done (spec §62): implemented, tested, secured, documented, integrated, accessible, responsive, localized, error-handled.
- No hard-coded UI strings. No secrets in the repo. Never log passwords, tokens, certificate numbers, patient info or payment data.
- No identifiable patient information anywhere in the MVP.
- Update `PROJECT_STATUS.md` at the end of every milestone.
- Commits: Conventional Commits. The owner pushes to GitHub manually.
