# IUA Connect

**The digital home of Israeli urology.** A web platform for the Israeli Urological Association: membership, news, events, education, notifications, search and an admin portal.

> **Status:** private pitch application, **demo data only**. Not affiliated with or endorsed by the Israeli Urological Association (IUA) or the Israeli Medical Association (IMA). No real personal data may be loaded before a professional legal review (see `SECURITY_MODEL.md`).

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
- **Account security** (`/he/account/security`): two-step verification with recovery codes, password change, and active sessions.

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
| `pnpm admin:create --email <address>`          | Development only: create a fictional administrator                        |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Quality checks                                                            |
| `pnpm build`                                   | Production build of everything                                            |
| `pnpm db:migrate`                              | Create/apply a migration in development (`prisma migrate dev`)            |
| `pnpm db:reset`                                | Rebuild the dev database from migrations and seeds (**deletes dev data**) |
| `pnpm openapi:generate`                        | Regenerate `packages/api-client` after API changes (CI checks it)         |

## Git

The local repository's remote is `origin` → `https://github.com/drmd1994-ops/IUA-connect.git`. Work happens on `feat/...` branches merged into `main` through pull requests (CONTRIBUTING.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint).
