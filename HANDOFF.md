# HANDOFF — IUA Connect

_Written 4 October 2026, after milestone M10 was merged. For whoever picks the project up next, person or AI._

Read this file, then `PROJECT_STATUS.md` (one section per milestone: what was delivered, what was verified, what is open). `CLAUDE.md` holds the standing rules.

The handoff written at the start of the project (27 September 2026) is kept as it was in `docs/product/HANDOFF_2026-09-27.md`. Where a decision record says "HANDOFF decision N", it means that file.

## 1. Goal

**IUA Connect, "the digital home of Israeli urology":** a web platform for the Israeli Urological Association. Members join and are verified, read news and guidelines, register for events, learn, get notifications and find each other; the association's staff run all of it from an admin area.

- **What it is today:** a private **demo**, built to be pitched to the association. It is not endorsed by or affiliated with the IUA or the Israeli Medical Association.
- **Owner:** a urology surgeon, the only developer for now.
- **The goal of the work so far:** a complete, honest MVP that can be shown start to finish. That goal is met (milestones M0 to M9), plus one small addition (M10).
- **The longer goal:** real use by the association, which needs the readiness checklist in `DEPLOYMENT.md` first, starting with a legal review.
- Full original specification: `docs/product/MASTER_SPEC.md`. What the MVP covers: `PRODUCT_REQUIREMENTS.md`. What comes later: `DEVELOPMENT_ROADMAP.md`.

**Rules that never change** (from `CLAUDE.md` and the owner):

- Windows, native, no Docker locally. PowerShell-compatible commands.
- Every milestone starts with a written plan in `docs/plans/` that the owner approves **before any code is written**. Decisions the plan doesn't cover are asked, not assumed.
- Each milestone ends with green CI, an updated `PROJECT_STATUS.md` and a demo.
- Demo mode: fictional people only. No identifiable patient information. The physician directory is not imported.
- No placeholder features presented as complete. No hard-coded UI text (Hebrew and English through i18n). No secrets in the repository.
- Nothing medical is shown without the owner's review.
- The owner merges, or asks for it. New libraries need the owner's approval.
- Never overwrite or delete files without examining them first.

## 2. Current state

**The MVP is complete and merged.** `main` is at M10 (commit `4684ec0`), CI green. There is no open pull request except the one that adds this file.

| Milestone | What it added                                                                              | Merged     |
| --------- | ------------------------------------------------------------------------------------------ | ---------- |
| M0        | Foundations: monorepo, API and web shells, CI, deny-by-default access, audit log           | 2026-09-27 |
| M1, M1b   | Accounts, sign-in, two-step verification, sessions; passkeys                               | 2026-09-29 |
| M2        | Profiles, membership, the two-step approval of applications, digital card, CSV import      | 2026-09-30 |
| M3        | News with a review workflow, guidelines, files, access tiers                               | 2026-10-01 |
| M4        | A small imported sample from the IUA website (titles, dates, links)                        | 2026-10-01 |
| M5        | Events: programme, registration, waiting list, calendar files, attendance by QR code       | 2026-10-02 |
| M6        | Education library, courses, practice exam questions                                        | 2026-10-02 |
| M7        | Notifications with per-kind switches, messages to members, member directory, search        | 2026-10-02 |
| M8        | Admin dashboard, accounts and roles, audit log screen, settings, the member's home page    | 2026-10-02 |
| M9        | Pitch readiness: demo reset and script, accessibility, performance, security scan, docs    | 2026-10-03 |
| M10       | Connection points for a video service and a push service (nothing visible changes)         | 2026-10-04 |

**What it runs on:** pnpm 10 and Turborepo, Node 24, TypeScript. API: NestJS 11, Prisma 7, PostgreSQL 16 (portable install at `C:\Users\PC\tools\pgsql`). Web: Next.js 16 on port 3001, Hebrew (right to left) and English, Tailwind v4. Tests: Jest, Vitest, Playwright with axe.

**Test totals at M10:** API 286 unit and 351 integration tests; 97 browser tests. CI also runs lint, type check, a secret and dependency scan, an OWASP ZAP passive scan and the build.

**How to show it**

```powershell
pnpm demo:reset   # rebuilds the demo from nothing (deletes the development data)
pnpm dev          # then open http://localhost:3001
```

All demo accounts use the password in `README.md` ("Demo accounts"). Staff accounts also need a code from the authenticator entry in `outbox\demo-authenticator.svg`. The walk-through is `docs/demo/DEMO_SCRIPT.md`.

**Checked by the owner:** the demo walk-through and the screen-reader check with NVDA (both 3 October 2026), and the ten sample exam questions (2 October 2026, loaded published since).

**Known gaps, all written down** in `docs/demo/KNOWN_LIMITATIONS.md`. The main ones:

- No payments, no mobile app, no CME tracking, no messaging or community features, no video hosting, no real email (emails are written to the `outbox` folder).
- No legal review, no penetration test, no load test.
- The speed target is met only in part: main content appears at about 3.0 s on a simulated slow phone, against a target of 2.5 s (`docs/demo/PERFORMANCE.md`).
- Three planned "interface only" items were never built: `PaymentProvider` with the `payments` and `invoices` tables, `IdentityProvider`, `MembershipSource`.
- One dependency advisory is accepted in the audit (`braces`, lint tooling only, no fixed version yet). Remove the entry in `pnpm-workspace.yaml` when a fix exists.

## 3. Active files

**Read first**

| File                                             | What it is                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `CLAUDE.md`                                      | Standing rules                                                        |
| `PROJECT_STATUS.md`                              | Decisions, and one section per milestone                              |
| `docs/plans/M<n>-*.md`                           | The approved plan of each milestone, with the owner's answers         |
| `docs/demo/KNOWN_LIMITATIONS.md`                 | What the app does not do                                              |
| `ARCHITECTURE.md`, `API_DESIGN.md`, `DATABASE_DESIGN.md`, `SECURITY_MODEL.md` | Design, brought in line with the code in M9 |
| `DEPLOYMENT.md`                                  | The readiness checklist before any real data                          |
| `TESTING.md`                                     | What each milestone's tests prove, and how to run them                |
| `docs/adr/`                                      | Decision records                                                      |

**Where the code is**

| Path                                   | What is there                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/`                | One folder per feature: auth, users, profiles, membership, institutions, news, guidelines, events, education, notifications, search, files, access, audit, admin, health. A module is imported only through its `index.ts` |
| `apps/api/src/infra/`                  | Adapters behind interfaces: mailer, storage, jobs, rate limit, crypto, and since M10 video and push |
| `apps/api/src/common/`, `src/config/`  | The request pipeline, guards, the checked settings (`env.schema.ts`)                           |
| `apps/api/prisma/`                     | `schema.prisma`, migrations, the seed layers (`seed/`), scripts (`demo-reset.ts`, `create-admin.ts`) |
| `apps/api/test/`                       | Integration tests (`*.int-spec.ts`) and their harness (`auth-harness.ts`)                      |
| `apps/web/src/app/[locale]/`           | The pages                                                                                      |
| `apps/web/src/features/`               | The screens, one folder per feature; `features/admin/` is the admin area                       |
| `apps/web/e2e/`                        | Browser tests                                                                                  |
| `packages/i18n/src/messages/{he,en}/`  | Every piece of text the user sees                                                              |
| `packages/shared/`                     | Error codes, permissions, roles, notification kinds                                            |
| `packages/api-client/`                 | The typed client, generated from the API (`pnpm openapi:generate`)                             |
| `.github/workflows/ci.yml`, `.zap/rules.tsv` | CI and the security scan's accepted rules                                                |

**Touched most recently (M9, M10)**

- `apps/api/src/infra/video/`, `apps/api/src/infra/push/` and their use in `modules/education/` and `modules/notifications/notifier.ts`.
- `apps/web/src/features/auth/login-form.tsx` (where sign-in lands).
- `apps/api/prisma/seed/demo-education.ts` (exam questions load published).
- `docs/demo/` (script, limitations, performance, NVDA checklist), `docs/security/ZAP_BASELINE.md`.

**Not part of the project:** `chat.md.txt` in the project folder is the owner's request for a chat feature (see section 6). It is not committed.

## 4. Changes made

The milestone table in section 2 is the summary; `PROJECT_STATUS.md` has the detail. Since M8, in order:

**M9, pitch readiness**

- `pnpm demo:reset`: rebuilds the demo and sets up two-step verification for the demo staff with one shared authenticator entry. Refuses anything but the development database on this machine.
- The demo script and the known-limitations page.
- Accessibility: an audit of every page in both languages (automated checks, keyboard, 320 px width), the fixes it led to, a statement at `/accessibility`.
- Performance: a third less script on every page (the validation library was removed from the browser), layout jumps removed, an index for the audit log page.
- Security: the OWASP ZAP scan in CI; a content security policy on "not found" pages for file-like addresses; every API answer now says `Cache-Control: no-store`.
- The design documents were corrected to match the code, including an "as built" list of 22 tables in `DATABASE_DESIGN.md`.

**After the owner's walk-through (3 October)**

- The ten sample exam questions load **published**, because the owner reviewed them.
- **Staff land on the admin dashboard after signing in**; everyone else on the home page. (In M8 everyone landed on the home page.)
- The accessibility statement records the owner's screen-reader check.

**M10, connection points**

- `VideoProvider` with `LinkVideoProvider`: a recording is a link to where it is hosted. Education asks the provider what may be attached and what address a viewer gets.
- `PushProvider` with `DisabledPushProvider`: sends nothing. The notifier hands it each notice in the app.
- Both are "interface only", by the owner's choice. No new library, no database change, nothing visible.

## 5. Failed attempts

What was tried and did not work, so nobody tries it the same way again.

**In the product**

- **One notification row per member for each published item (M7).** It did not scale to a whole membership. Replaced by one announcement per item, worked out per reader when they look.
- **Loose typing-mistake tolerance in search (M7).** It matched unrelated words. Now it applies per word, to titles only, for words of four letters or more.
- **The speed target of 2.5 s (M9).** Not reached on a simulated slow phone with small fixes; it stays near 3.0 s. The real fix is to have the server send public pages complete, which changes every public page. Not done; proposed as the first task after the pitch.
- **"Interface only" items from the original plan.** Five connection points and two payment tables were promised and never created, and no milestone noticed until M9. Two were built in M10; three are still missing (section 6).
- **The M9 demo script said the admin area opens by itself after an administrator signs in.** It did not. Found by the owner in the walk-through; the behaviour was then changed to match.
- **A sample message to members said they could renew from "My membership".** The app has no such function. The text was corrected.

**In testing and CI**

- **Integration tests ran out of memory in CI.** Fixed by running them in one worker that is recycled (`--maxWorkers=1`, `workerIdleMemoryLimit`).
- **Browser tests hit the real sign-in rate limit in CI.** Fixed with `RATE_LIMIT_SCALE`, which the API refuses in production.
- **The first ZAP scan failed the build** with seven warnings. One was a real gap and was fixed; six are accepted with reasons.
- **A new advisory for `braces` turned the security job red** with no fixed version available. Accepted as a documented exception, with the owner's agreement.
- **`pnpm db:reset` was never checked.** Prisma refuses to let an AI agent run it without the owner's explicit consent. Use `pnpm demo:reset`.

**In the way of working (worth knowing on this machine)**

- **Stopping a dev or production server task leaves its child processes alive** (the Next.js server, the API, the NestJS watcher). They keep the ports and can serve a mix of old and new builds. After stopping, check ports 3001 and 4000 and stop what is left.
- **Shell here-documents break on apostrophes**, and scripted find-and-replace with regular expressions damaged `ARCHITECTURE.md` once. Edit files with the editing tools, line by line.
- **Markdown files do not open readably** on the owner's computer. Give the owner an HTML page, or a formatted copy in the browser.
- **Commit messages are checked** (commitlint): lower-case subject, lines of at most 100 characters.
- **A long-running `pnpm dev` was stopped by the system once** for low memory.
- **The owner rejected the first set of questions for M7** and asked for something more specific (a switch per kind of content, for email and for the app). Ask about what the user will see, not about mechanisms.

## 6. Next step

**Waiting for the owner's decision. Nothing is in progress.**

1. **A chat feature has been asked for.** The owner's request is in `chat.md.txt`: private one-to-one chat and public rooms, in real time, with moderation, reporting, blocking, attachments and privacy settings. It is by far the largest feature since the MVP. Before any code it needs an approved plan (`docs/plans/M11-chat.md`), and these decisions from the owner first:
   - **How big the first version is.** The request lists about a hundred capabilities; a first milestone should be a part of it.
   - **Real time needs a new library** (WebSockets), which needs the owner's approval, or a simpler first version that refreshes every few seconds.
   - **"Doctor/patient chats" are named as a future direction.** Patient information is not allowed anywhere in this project today; that would need a legal review first.
   - **Who may message whom:** members only, and whether it follows the opt-in member directory.
   - **Moderation and retention:** who moderates, how long messages are kept, and what staff may read. Private messages between doctors are sensitive.
   - The request says "do not stop after creating a plan". The project's rule is the opposite, and the rule stands unless the owner changes it.
2. **Still open from M9:** whether the last three "interface only" items (payments, outside sign-in, the Medical Association's member list) are built now or each with its feature; and confirming the "who" column of the readiness checklist in `DEPLOYMENT.md`.
3. **Proposed after the pitch,** each with its own plan: have the server send public pages complete (speed); then the readiness checklist, starting with the legal review; then the Phase 2 list in `DEVELOPMENT_ROADMAP.md`.
