# IUA Connect

**The digital home of Israeli urology.** A web platform for the Israeli Urological Association: membership, news, events, education, notifications, search and an admin portal.

> **Status:** private pitch application, **demo data only**. Not affiliated with or endorsed by the Israeli Urological Association (IUA) or the Israeli Medical Association (IMA). No real personal data may be loaded before a professional legal review (see `SECURITY_MODEL.md`).

## Showing the demo

```powershell
pnpm demo:reset   # rebuilds the demo from nothing (asks first; deletes the development data)
pnpm dev          # then open http://localhost:3001
```

| For the pitch                                                      | What it holds                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`docs/demo/DEMO_SCRIPT.md`](docs/demo/DEMO_SCRIPT.md)             | The walk-through, step by step, with the accounts to use         |
| [`docs/demo/KNOWN_LIMITATIONS.md`](docs/demo/KNOWN_LIMITATIONS.md) | What it does not do, so nothing is promised by mistake           |
| [`docs/demo/PERFORMANCE.md`](docs/demo/PERFORMANCE.md)             | Page-speed measurements, before and after                        |
| [`docs/demo/NVDA_CHECKLIST.md`](docs/demo/NVDA_CHECKLIST.md)       | The screen-reader check, for a person to do                      |
| [`docs/security/ZAP_BASELINE.md`](docs/security/ZAP_BASELINE.md)   | The automated security scan: what it found and what was accepted |

## For developers

| Read first                                                        | What it holds                                |
| ----------------------------------------------------------------- | -------------------------------------------- |
| [`PROJECT_STATUS.md`](PROJECT_STATUS.md)                          | Decisions, open questions, current milestone |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                              | Modular monolith, request pipeline, adapters |
| [`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md)                | Repository layout, tooling, milestones M0–M9 |
| [`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md)              | MVP scope and acceptance criteria            |
| [`SECURITY_MODEL.md`](SECURITY_MODEL.md)                          | Threat model and controls                    |
| [`DATABASE.md`](DATABASE.md) · [`API.md`](API.md)                 | Pointers to the database and API design      |
| [`docs/adr/`](docs/adr)                                           | Architecture decision records                |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`TESTING.md`](TESTING.md) | How to work on the code and run tests        |

## Repository layout

```
apps/api            NestJS API (modular monolith), Prisma, migrations, integration tests
apps/web            Next.js web app: public site, member area, /admin route group
packages/shared     Zod schemas, error codes, permission keys, UUID v7
packages/i18n       UI translations (he default/RTL, en); ar and ru ready to add
packages/ui-tokens  Design tokens → Tailwind @theme CSS
packages/api-client Typed client generated from the API's OpenAPI document
packages/eslint-config, packages/tsconfig   Shared tooling configuration
tools/scripts       setup-dev, db-provision (Windows-first, plain Node)
docs/               Product spec, ADRs, and topic folders
```

## Windows setup (native, no Docker)

Tested on Windows 10/11 with PowerShell 5.1.

### 1. Prerequisites

| Tool       | Version    | Check               |
| ---------- | ---------- | ------------------- |
| Node.js    | **24 LTS** | `node -v` → `v24.x` |
| pnpm       | 10         | `pnpm -v` → `10.x`  |
| Git        | any recent | `git --version`     |
| PostgreSQL | **16+**    | `psql --version`    |

- **Node.js 24:** install the Windows installer (.msi, x64) from <https://nodejs.org>. Open a **new** terminal afterwards so `PATH` updates. If `node -v` still shows an older version, an older Node earlier in `PATH` wins: check `where.exe node` and remove the old entry from your user `PATH` (System → Environment Variables).
- **pnpm:** `npm install -g pnpm@10` (installs for your user; no administrator rights needed).
- **gitleaks (optional, recommended):** the pre-commit hook scans staged changes for secrets when `gitleaks` is on `PATH`; CI always runs it. Download `gitleaks_<version>_windows_x64.zip` from <https://github.com/gitleaks/gitleaks/releases>, extract `gitleaks.exe` into a folder on your `PATH`.

### 2. PostgreSQL

The app needs a running PostgreSQL 16+ server and a **superuser connection** to create its own roles and databases (`PG_SUPERUSER_URL` in `.env`, default `postgresql://postgres@localhost:5432/postgres`).

- **Installed as a Windows service** (EnterpriseDB installer): check it's running with
  `Get-Service postgresql*` and start it with `Start-Service postgresql-x64-16` (administrator PowerShell). Put the superuser password in `PG_SUPERUSER_URL`, e.g. `postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres`.
- **Portable install (zip + `pg_ctl`)**, as on the owner's machine (`C:\Users\PC\tools\pgsql`, data in `C:\Users\PC\pgdata`):
  ```powershell
  & C:\Users\PC\tools\pgsql\bin\pg_ctl.exe status -D C:\Users\PC\pgdata
  & C:\Users\PC\tools\pgsql\bin\pg_ctl.exe start  -D C:\Users\PC\pgdata -l C:\Users\PC\pgdata\server.log
  ```
- **`psql` on PATH:** add the `bin` folder (e.g. `C:\Program Files\PostgreSQL\16\bin` or `C:\Users\PC\tools\pgsql\bin`) to your user `PATH`. `psql` is only needed for manual inspection; the scripts connect directly.

`setup:dev` creates, and never deletes:

| Object             | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `iua_owner` role   | Owns the databases; runs migrations                                         |
| `iua_app` role     | Used by the API at runtime; **cannot** UPDATE/DELETE/TRUNCATE the audit log |
| `iua_connect`      | Development database                                                        |
| `iua_connect_test` | Integration-test database                                                   |

Other databases on the server are not touched.

### 3. Install and set up

```powershell
cd "C:\Users\PC\Desktop\IUA CONNECT"
pnpm install
pnpm setup:dev
```

Or run the bootstrap script, which also checks Node and Git and installs pnpm if missing:

```powershell
powershell -ExecutionPolicy Bypass -File tools\scripts\setup-dev.ps1
```

`pnpm setup:dev` is safe to re-run. It checks prerequisites, creates `.env` from `.env.example` with **random local passwords** (never printed, never committed), provisions the roles and databases, migrates the dev and test databases, and seeds.

### 4. Run

```powershell
pnpm dev
```

- Web: <http://localhost:3001> (redirects to `/he`; English at `/en`). The web app proxies `/api/v1` to the API, so the browser only talks to port 3001.
- API: <http://localhost:4000> · health: `/health/live`, `/health/ready` · Swagger UI (development only): `/api/docs`

### 5. Accounts in the demo

- **Sign up** at `/he/register`. Emails aren't sent: each one is written as an HTML file to the `outbox/` folder at the repository root. Open the newest file and click its link to verify the address or reset a password.
- **First administrator** (fictional, reserved domains only):
  ```powershell
  pnpm admin:create --email admin@example.test
  ```
  The password is printed once. At first sign-in the account is sent to **Account security** to set up two-step verification (an authenticator app such as Google or Microsoft Authenticator); every administrative role requires it. Options: `--role IUA_ADMIN`, `--locale en`, `--reset-password`.
- **Account security** (`/he/account/security`): passkeys, two-step verification with recovery codes, password change, and active sessions.
- **Passkeys:** on Account security, **Add a passkey** opens Windows Hello (or your phone or security key). Afterwards, **Sign in with a passkey** on the sign-in page signs you in without a password. Passkeys only work on the site's own address (`localhost` in development).

#### Demo accounts (seeded by `pnpm db:seed`, development only)

Fictional people on the reserved `demo.test` domain. They all share one demo password: **`olive-grove-demo-2026`**. The seed refuses to run in production, and it runs once (it's skipped if the demo admin already exists).

| Account                                                    | What it shows                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `admin@demo.test`                                          | IUA admin: approval queue, members, hospitals and directors, import |
| `director.rambam@demo.test`, `director.sheba@demo.test`    | Department directors (Rambam, Sheba urology)                        |
| `member.full@demo.test`                                    | Active full member with a digital card                              |
| `member.resident@demo.test`, `member.honorary@demo.test`   | Active resident and honorary member                                 |
| `member.suspended@demo.test`, `member.expired@demo.test`   | A suspended and an expired membership                               |
| `applicant.director@demo.test`                             | Application waiting for the Rambam director                         |
| `applicant.admin@demo.test`, `applicant.student@demo.test` | Applications waiting for final approval                             |
| `applicant.nodirector@demo.test`                           | Application from a department without a director (flagged)          |
| `applicant.rejected@demo.test`                             | Application the director didn't approve, with the reason            |
| `editor@demo.test`                                         | Content editor: writes news, education items and exam questions     |
| `events@demo.test`                                         | Event admin: creates events, sees registrations and attendance (M5) |
| `admin2@demo.test`                                         | A second IUA admin, so a message to members can be approved (M7)    |
| `super@demo.test`                                          | Super admin: gives and removes roles, changes the settings (M8)     |

The admins, the directors, the editor and the event admin must have two-step verification, because their roles require it. After `pnpm db:seed` alone, each sets it up at first sign-in (a passkey or an authenticator app). After **`pnpm demo:reset`** it is already set up, with one shared authenticator entry for all of them, so a pitch isn't interrupted: the reset writes `outbox/demo-authenticator.svg`; open it and scan it once with an authenticator app. The entry's secret is `DEMO_TOTP_SECRET` in `.env` (not in the repository), and it applies to `@demo.test` accounts only.

- **Membership (M2):** the account menu has **My profile** (each field has its own "who can see this"), **My membership** (apply, status, history) and **Membership card** (a QR code that changes every 4 minutes; scanning it opens `/card/verify`). Directors also see **Applications to review**, and admins see **Administration** (`/admin`).
- **News and guidelines (M3):** `/news` and `/guidelines` are public. The seed adds sample news in every state (draft, waiting for review, scheduled, published, members-only, archived) and fictional guidelines. The editor writes at `/admin/news`; the admin reviews there (publish, schedule or send back) and manages `/admin/guidelines`. On a database seeded before M3, run `pnpm db:seed` again to add the content.
- **Events (M5):** `/events` is public. The seed adds five fictional events: an annual meeting with a programme, a one-place workshop with a waiting list, a members-only meeting, a cancelled one and a past one with attendance. `member.full@demo.test` is registered for the annual meeting with two overlapping sessions (see **My schedule** in the account menu). The event admin works at `/admin/events`: the event page there has the programme, the registrations and the attendance, including the QR code to show at the venue. On a database seeded before M5, run `pnpm db:seed` again.
- **Imported sample (M4):** `pnpm db:seed` also loads a small sample of the IUA website from committed fixtures: 8 news items (title, date and a link to the source) and 9 guideline entries (details and the publisher's link). No network is needed. `pnpm import:remove` takes the sample out again. To change the sample, edit `tools/importer/sources.json`, run `pnpm import:fetch` and review the fixtures before committing them. The owner has confirmed permission to show this content (O4 in `PROJECT_STATUS.md`).
- **Education (M6):** `/education` is public. The seed adds ten fictional library items of every type (one members-only, one waiting for review, one draft, one archived) and a course of four lessons. Videos, webinars and podcasts are links to where they are hosted (ADR 0008). The editor writes at `/admin/education`; the admin reviews there. On a database seeded before M6, run `pnpm db:seed` again.
- **Exam questions (M6):** `/education/exam` asks one multiple-choice question at a time; after the answer it shows the right option, why each option is right or wrong, and a short summary of the topic. Signed-in people find their score under **My exam results** in the account menu. The seed loads ten sample urology questions **waiting for review**: nothing is shown until the admin has checked each one at `/admin/education/questions` and published it.
- **Notifications (M7):** the bell in the header opens **Notifications**; **Choose what you receive** there has a switch per kind of content for the app and for email. Email about new content is one summary a day, sent in the morning; to see it at once run `pnpm job:run notifications.content-digest` and look in `outbox/`.
- **Messages to members (M7):** `/admin/broadcasts`. A message is sent only after a different admin approves it: the seed leaves one written by `admin2@demo.test` waiting, which `admin@demo.test` can approve. The emails go out within a minute.
- **Member directory (M7):** `/members`, for members with an active membership. A member joins from **My profile**; the seed lists three demo members showing different fields.
- **Search (M7):** the field in the header, or `/search`. Try a Hebrew word with a prefix, for example "בכנס".
- On a database seeded before M7, run `pnpm db:seed` again.
- **Admin portal (M8):** `/admin` opens on a dashboard of what is waiting. **Accounts** lists every account (disable, enable, unlock, sign out everywhere; each with a reason). **Audit log** shows what was done, by whom and when. As `super@demo.test`: roles are given and removed on an account's page, and **Settings** holds the contact details in the footer and a notice banner (written by the seed, switched off).
- **Member dashboard (M8):** after sign-in the home page shows the member's membership, new notifications, upcoming events, news, education and quick actions. Features planned for later appear as "Coming soon" and can't be used.
- On a database seeded before M8, run `pnpm db:seed` again.
- **CSV import:** `/admin/import` takes a file with the header `email,first_name,last_name,membership_type[,identifier,end_date,payment_status,locale]`. Run the dry run first, then apply the same file.

### Troubleshooting

| Symptom                                                 | Fix                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running scripts is disabled on this system` (pnpm.ps1) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run `pnpm.cmd` instead of `pnpm`                                                                                            |
| `EADDRINUSE :::3001`                                    | Another app uses port 3001. Stop it, or run the web app on another port: `pnpm --filter @iua/web exec next dev --port 3002` and add `http://localhost:3002` to `WEB_ORIGIN` in `.env` |
| `setup:dev` can't connect to PostgreSQL                 | Server not running (see step 2), or wrong password in `PG_SUPERUSER_URL`                                                                                                              |
| `Node.js 24 LTS is required`                            | See step 1; open a new terminal after installing                                                                                                                                      |
| Files show as modified with only line-ending changes    | The repo uses LF (`.gitattributes`). Recommended: `git config --global core.autocrlf input`                                                                                           |
| Hebrew looks wrong in the PowerShell console            | Console output only; run `chcp 65001` for UTF-8. The app itself is unaffected                                                                                                         |

## Everyday commands

| Command                                        | What it does                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                                     | API + web in watch mode                                                   |
| `pnpm test`                                    | Unit tests (all packages), including the deny-by-default route gate       |
| `pnpm test:integration`                        | API integration tests against `iua_connect_test`                          |
| `pnpm --filter @iua/web e2e`                   | Playwright end-to-end + accessibility tests (see TESTING.md)              |
| `pnpm demo:reset`                              | Development only: rebuild the demo from nothing (**deletes dev data**)    |
| `pnpm job:run <job>`                           | Run one background job now, e.g. `notifications.content-digest`           |
| `pnpm admin:create --email <address>`          | Development only: create a fictional administrator                        |
| `pnpm import:fetch`                            | Development only: read the hand-picked IUA website pages into fixtures    |
| `pnpm import:remove`                           | Development only: delete everything the content import created            |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Quality checks                                                            |
| `pnpm build`                                   | Production build of everything                                            |
| `pnpm db:migrate`                              | Create/apply a migration in development (`prisma migrate dev`)            |
| `pnpm db:reset`                                | Rebuild the dev database from migrations and seeds (**deletes dev data**) |
| `pnpm openapi:generate`                        | Regenerate `packages/api-client` after API changes (CI checks it)         |

## Git

The local repository's remote is `origin` → `https://github.com/drmd1994-ops/IUA-connect.git`. Work happens on `feat/...` branches merged into `main` through pull requests (CONTRIBUTING.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint).
