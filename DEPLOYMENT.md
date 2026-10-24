# Deployment

**Current state (end of the MVP, M9): not deployable to production, by design.** The demo runs on one Windows computer (`pnpm demo:reset`, then `pnpm dev`). Only demo adapters exist (local storage, console mailer, no-op malware scanner, in-memory rate limiting), and the API refuses to start with `NODE_ENV=production` while any of them is selected.

## Before any real deployment: the readiness checklist

Nothing below is done. Every line must be ticked before a real member's details are loaded. "Who" is a proposal for the project owner to confirm; "the association" means whoever the IUA names.

| #   | What                                                                                                                                                                                                                                                                                                                                         | Who                                | Done |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- |
| 1   | Legal and privacy review by a professional (open item O6): terms of use, privacy notice, the wording of the directory consent, the security level under the Privacy Protection Regulations and the database definition document                                                                                                              | The association, with a lawyer     | ☐    |
| 2   | An accessibility coordinator named on the accessibility statement, and an accessibility check by someone who uses a screen reader every day, or an outside audit (the owner's own NVDA check, 2026-10-03, found nothing)                                                                                                                     | The association; the project owner | ☐    |
| 3   | A named reviewer for medical content. (The ten sample exam questions were read by the project owner, a urologist, on 2 October 2026; the association may want its own reviewer to read them too)                                                                                                                                             | The project owner; the association | ☐    |
| 4   | Who hosts it and under whose name; hosting in an Israeli region, TLS everywhere                                                                                                                                                                                                                                                              | The association                    | ☐    |
| 5   | Production adapters written and tested: object storage (since M13 it must also store a file from disk and serve a part of one, for chat video), a mail provider with the association's sending domain, a virus scanner (since M13: chat videos are stored without being handed to the scanner, which must change), a shared rate-limit store | Developer                          | ☐    |
| 6   | Secrets (signing keys, field-encryption keys, database passwords) in a secret manager, not in files                                                                                                                                                                                                                                          | Developer                          | ☐    |
| 7   | Managed PostgreSQL 16+ with backups, point-in-time recovery and a restore that was actually tried                                                                                                                                                                                                                                            | Developer                          | ☐    |
| 8   | Separate database roles as in development: an owner role for migrations (`prisma migrate deploy`) and an application role with the reduced privileges the migrations set. Set `iua.app_role` before migrating (see `tools/scripts/db-provision.mjs`)                                                                                         | Developer                          | ☐    |
| 9   | Monitoring, alerts on security events, log retention, and a written plan for a security incident (who is told, and when)                                                                                                                                                                                                                     | Developer; the association         | ☐    |
| 10  | A penetration test by an outside tester. The passive OWASP ZAP scan runs in CI since M9 (`docs/security/ZAP_BASELINE.md`); it does not replace one                                                                                                                                                                                           | The association (commissions it)   | ☐    |
| 11  | A load test, and the page-speed work in `docs/demo/PERFORMANCE.md`                                                                                                                                                                                                                                                                           | Developer                          | ☐    |
| 12  | Each administrator sets up their own two-step verification; the demo accounts and the shared demo authenticator entry do not exist in production (the seed and `pnpm demo:reset` refuse to run there)                                                                                                                                        | Developer; each administrator      | ☐    |
| 13  | How real members are brought in (applications, the CSV import, or the Medical Association's list), decided and tried on a copy first                                                                                                                                                                                                         | The association; developer         | ☐    |

The open decisions behind lines 1, 4 and 13 are listed in `docs/demo/KNOWN_LIMITATIONS.md` §5.

## The hosted demo on Railway (M18)

A demo, not a deployment for real members: fictional data, the demo's stand-ins (files on a disk, emails to a folder, no virus scan), and the readiness checklist above still all open. Plan: `docs/plans/M18-hosted-demo.md`.

- **Where:** the Railway project `med-connect-demo`, in the owner's account. Three services:
  - `Postgres`, reachable only over Railway's private network;
  - `api`, with a disk at `/data` for uploads and the email folder;
  - `web`.
- **Addresses:** the site at https://web-production-3a424c.up.railway.app, the server at https://api-production-81c9.up.railway.app (the app talks to it directly). The browser talks only to the site, which passes `/api/v1` on to the server's private address.
- **The hosted state:** the server runs with `NODE_ENV=production` and `DEMO_HOSTED=true`. It then allows the stand-ins, and refuses to start without:
  - its own `DEMO_PASSWORD` (12 or more characters, not the documented one), which the owner typed into Railway and nobody else has seen;
  - keys whose ID is not `dev-`.

  Real production, without `DEMO_HOSTED`, keeps every check.

- **Settings:** the server's keys and database passwords were generated once and given to Railway through standard input, never printed. They live only in the `api` service's variables. If the field-encryption key is lost, the stored (made-up) licence numbers can't be read; reseed.
- **On every start** the server runs `pnpm hosted:start` (`tools/scripts/hosted-start.mjs`):
  1. the two database roles and the database `medconnect`, as `db-provision.mjs` does on this computer;
  2. `prisma migrate deploy`, as the owner role;
  3. the demo seed, only when the database has no users yet; otherwise only the seed layers that check for themselves: the reference layer (new roles and permissions, such as those of M28), the question bank's starter set (M23), the demo's positions and mentors (M28), its communities (M25, which also archives every chat room), its research projects and publications (M27), its journal club entries (M31), its made-up cases waiting for review (M26), and its three teaching scans waiting for review (M36, downloaded from the release `demo-scans-v1` and checked by SHA-256), each added once;
  4. the server, as the application role.

**Deploy a new version** (from the repository root, signed in with `railway login`, after the checks are green):

```powershell
railway up --service api --detach
railway up --service web --detach
```

**Then check it:** `pnpm smoke:hosted` (`tools/scripts/smoke-hosted.mjs`): the site, the server, the site reaching the server, a calculator, and sign-in refusing a wrong password. To also sign in as a demo member and open live chat, set `SMOKE_PASSWORD` to the demo password in the shell first; it is read from there only and never printed.

**The demo's emails** (sign-up confirmations, password resets) are under Administration → Demo emails, for platform staff (`users.manage`). Each opening is recorded in the audit log.

**The scan viewer (M36)** is not in the repository: the site's build downloads it (`apps/viewer/fetch.mjs`) from the GitHub release named in `apps/viewer/bundle.json`, and refuses an archive whose SHA-256 differs. After a change to `apps/viewer` (OHIF's version, a patch, the settings, a text), push the change to a branch named `viewer/...` (or run the "Viewer bundle" workflow): it builds the viewer and attaches it to a new release, and its summary shows the new `bundle.json`. Until `bundle.json` is updated, CI refuses to build the site.

`.railwayignore` and `.dockerignore` keep `.env` and local files out of the upload. The site's address for the server is fixed when the site is built (`API_INTERNAL_URL`, a build argument), so deploy the site again if that changes.

**Reset the demo data:** delete the `Postgres` service's data and redeploy `api`. The next start finds no users and seeds again. Uploaded files on the `api` disk are left behind, unreferenced. This is done in Railway's dashboard by the owner; nothing in the repository does it, as `pnpm demo:reset` refuses any database not on this computer.

**The app's key, passkeys and links (M18b):**

- **The key.** The app is signed with its own key, not Expo's public one. It was made on 2026-10-23 and lives in three places:
  - the GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`;
  - a backup in the owner's `Documents\Med Connect app key` folder;
  - nowhere in the repository.
- **The fingerprint.** Its public SHA-256 fingerprint is in the repository variable `ANDROID_CERT_SHA256`. The **Demo APK** workflow checks that the key opens, signs with it, and checks the signature against that fingerprint.
- **Settings on Railway:**
  - `api`: `ANDROID_CERT_SHA256`, the same fingerprint. The server then accepts passkeys from the app (origin `android:apk-key-hash:…`).
  - `web`: `ANDROID_PACKAGE` (`test.demo.medconnect`) and `ANDROID_CERT_SHA256`. The site then serves `/.well-known/assetlinks.json`, which lets the app use the site's passkeys and open its links. Without them the file answers 404 and the app works as before, with passwords and the browser.
- **The links** that open the app are listed in `apps/mobile/app-links.json`. The workflow's `DEMO_WEB_URL` must be the site's https address, because the links are made from it when the app is built.
- **Check before installing the app:**
  - `https://<site>/.well-known/assetlinks.json` shows the package and the fingerprint.
  - Google's checker agrees: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<site>&relation=delegate_permission/common.handle_all_urls`.
  - Android checks the links once, when the app is installed. If the file was wrong then, reinstall the app after fixing it.
- **A new key**, if the old one is lost:
  1. Make the key and put it in the secrets.
  2. Change `ANDROID_CERT_SHA256` everywhere.
  3. Phones uninstall the old app once.
  4. Passkeys stay, because they belong to the site, not to the key.

**The app:** the repository variables `DEMO_API_URL` and `DEMO_WEB_URL` hold the hosted addresses. The **Demo APK** workflow (Actions → Demo APK → Run workflow) builds an .apk that uses them. The tunnel's address was `https://hqvwt07k-4000.euw.devtunnels.ms`; to go back to the tunnel, set `DEMO_API_URL` to it again and rebuild.

## Build artefacts

- API: `pnpm --filter @medconnect/api build` → `apps/api/dist`, start with `node dist/main.js`. Run `prisma migrate deploy` with the owner connection before starting a new version.
- Web: `pnpm --filter @medconnect/web build` → `next start`. The web app renders per request (nonce-based CSP).
- Docker images are used for the hosted demo only (`apps/api/Dockerfile`, `apps/web/Dockerfile`, built by Railway from the repository root); none are required locally.
