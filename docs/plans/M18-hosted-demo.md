# M18: the demo on a hosted service (Railway)

**Status: proposed on 2026-10-07; deferred on 2026-10-13; checked against the code and rewritten on 2026-10-19 (§0b); approved by the owner on 2026-10-19, who opened a paid Railway plan and asked to deploy (§10). Being built.**

Track: Operate. Size: M. Needs first:

- the owner's answers in §9;
- a Railway account opened by the owner (Claude does not open accounts or enter payment details);
- for the app, a way to build the .apk (§0b).

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. The owner deferred it on 2026-10-13 ("for now we continue the build without a server"). When it is taken up again, it is hosted under the product's name, in the operator's own account, after M16 and M17, so that what is hosted is already the independent product. The demo's organisation stays fictional until the real association agrees to be shown.

## 0b. What I checked on 2026-10-19

**Railway's prices** (railway.com/pricing, read on 2026-10-19) are the same as on 2026-10-07:

- the Hobby plan is $5 a month and includes $5 of use;
- above that: $10 per GB of memory a month, $20 per processor a month, $0.15 per GB of disk a month, $0.05 per GB sent out.

**What still holds from 2026-10-07:**

- The repository has no container files and no Railway settings.
- The site passes `/api/v1/...` on to the server, so a browser talks to one address.
- Live chat fits Railway's limits on open connections.
- The server refuses to start as production with any demo stand-in.
- **The demo password is still written in the code** (`apps/api/prisma/seed/demo.ts`).

**What changed since then:**

- **M16 (the independent platform)** gave the product its name, Med Connect, and a fictional demo organisation. What would be hosted is now the independent product, as §0 asks.
- **M17 (verification)** adds two things that matter on a host:
  - Medical students' confirmation files are kept on the same disk as other uploads, so the disk needs the same care.
  - Licence numbers are encrypted with the field-encryption key. The hosted demo gets its own new key, kept only in Railway's settings. If the key is lost, the stored numbers can't be read; they are made up, so the cost is only a reseed.
- **M30 (calculators)** runs entirely in the browser and the app, so it changes nothing on the server.
- **GitHub Actions is blocked by billing,** and the owner said on 2026-10-13 not to run tests on GitHub for now. This affects M18 twice:
  - **The .apk is built on GitHub** (`.github/workflows/apk.yml`), so a new .apk with the hosted address can't be built until billing is fixed, unless it is built some other way (§9, question 4).
  - The rule "nothing is deployed that did not pass CI" becomes, while checks are paused: **nothing is deployed that did not pass the full local checks.** Every deploy report says which checks ran.
- **The host:** after the Railway answer, the owner asked about hosts in Israel and did not pick one. Railway has no Israeli region. For a demo with fictional data, that doesn't matter; for real data it is a question for M19 and the legal review. §9, question 1 confirms Railway.

## 1. Goal and exit criteria

**Goal:** the demo works with the owner's computer switched off. The site, the server, the database and the files run on Railway at fixed addresses, and the app uses them.

**Exit criteria**

- The site opens at its Railway address from any network, and a demo account signs in. A chat message sent in one browser arrives live in another.
- The app, built with the hosted address, signs in and shows live chat with this computer off. This depends on question 4.
- A new version is put on Railway by one documented step. The demo data is wiped and seeded again by one documented step.
- The server still refuses to start as real production with any demo stand-in, and the existing tests pass unchanged.
- Local checks green (or CI, if billing is fixed), `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In**

1. Three services in one Railway project: the server, the site, and Railway's PostgreSQL. The server gets a disk ("volume") for uploaded files, students' confirmations and the email folder.
2. Container files for the server and the site, and Railway's settings kept in the repository, so the whole set-up can be rebuilt from nothing.
3. A named "hosted demo" state of the server (§3, §4).
4. The demo password taken from a secret setting on Railway, not from the code. The owner chooses it and types it in.
5. Start-up on Railway: database changes applied, the two database roles made as in development, the demo data seeded once.
6. A demo-only page where staff read the emails the demo "sent". Today these are files on this computer, and sign-up and password reset need them.
7. The app pointed at the hosted address, with its own icon and start screen, and a new .apk (question 4).
8. The tunnel kept and documented as the fallback.

**Later, as M18b, if the owner agrees**

- Passkeys in the app, and email links that open the app. Both need the fixed address this milestone provides, an app library and settings files served by the site. The demo is useful without them.

**Not in**

| Item                 | Where                                                |
| -------------------- | ---------------------------------------------------- |
| Real members' data   | M19 and M20                                          |
| A bought domain name | Not needed; can be added later in Railway's settings |
| Sending real email   | M19                                                  |
| Hosting in Israel    | M19, if the legal review asks for it                 |

## 3. Rules

- **Demo data only.** The banner "all people and data shown are fictional" stays on every page and screen.
- **"Hosted demo" is its own state, never production.**
  - It allows the demo's stand-ins (files on the disk, emails to a folder, no virus scan).
  - In exchange it requires keys not marked "dev", a demo password that is not the one in the code, and the demo banner.
  - It can't be combined with real production. Real production's checks are not changed.
- **The database is not reachable from the internet.** The server reaches it over Railway's private network.
- **Secrets live in Railway's settings,** never in the repository. Claude never sees the owner's card, Railway password or demo password.
- **Nothing is deployed without green checks** (§0b).
- **The real association's name, logo and content** do not appear without its written agreement, as everywhere.

## 4. What is built

- **Server:**
  - the "hosted demo" state in the settings check, with a test for every combination that must be refused;
  - the demo seed reading its password from a setting;
  - the staff's page of sent emails, demo only and refused in production.
- **Site:** the server's private address given at build time, because the site's pass-through is fixed when the site is built.
- **Repository:** `apps/api/Dockerfile`, `apps/web/Dockerfile`, Railway's settings files, and a "Deploy" section in `DEPLOYMENT.md` with the one-step deploy and the one-step reset.
- **App:** the hosted addresses, an icon and a start screen, and the .apk rebuilt (question 4).
- **Database:** no change.

## 5. New tools, services and costs (each needs the owner's approval)

| What                                                           | Why                                                                             | Cost                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Railway account on the Hobby plan, opened by the owner       | The host                                                                        | $5 a month, which includes $5 of use                                                                                                                                                                       |
| **Use above the included $5**                                  | Three services that never sleep                                                 | **My estimate: $3 to $8 more a month, so $8 to $13 in all.** Memory is most of it: the three use about 0.7 to 1.1 GB on this computer, at $10 per GB. The first week on Railway will show the real figure. |
| Railway's command-line tool (`@railway/cli`), on this computer | So Claude can deploy and read logs after the owner signs in through the browser | Free. Installed under the 7-day rule for new versions, like any other tool                                                                                                                                 |
| For the .apk, only if question 4 is answered "build here"      | Java and the Android build tools on this computer                               | Free, but several GB on disk                                                                                                                                                                               |

**To stay near $5:** Railway can put a service to sleep when nobody uses it and wake it on the next request. For a demo used now and then, this would roughly halve the cost. The price is a wait of some seconds on the first request after a pause. Background work (scheduled publishing, reminders, closing verifications) also doesn't run while asleep (question 2).

**A spending limit** can be set in Railway's settings. I recommend $15, so a mistake can't cost more.

## 6. Tests

- **Server (unit):**
  - the settings check accepts "hosted demo" only with non-dev keys, a changed demo password and the stand-ins;
  - it refuses "hosted demo" together with real production;
  - real production still refuses every stand-in;
  - the seed uses the given password, and refuses the one in the code when hosted.
- **Server (integration):** the sent-emails page is for staff only, and absent in production.
- **Existing suites:** unchanged and green.
- **After each deploy, a smoke check kept as a script:** the site answers, the server's health address answers, a demo sign-in works, and the chat stream opens and delivers its first event.
- **By hand:** two browsers for live chat; the app with this computer off.

## 7. Order of work (a commit at each step; tests green at each)

1. This plan approved. The owner opens the Railway account and signs the command-line tool in through the browser.
2. The "hosted demo" state and the demo password from a setting, with their tests.
3. Container files. Both apps are first built and run on this computer's own Node (there is no Docker here), then on Railway.
4. The Railway project: the database, the server with its disk, the site. Secrets set by the owner, first deploy, seed.
5. The smoke check, and the deploy and reset steps written down.
6. The sent-emails page.
7. The app: addresses, icon and start screen, and the .apk built the way question 4 decides, then tried with this computer off.
8. One week's real cost read from Railway and written into the status. Sleep on or off decided on that.
9. Documents, `PROJECT_STATUS.md`, demo.

**Git:** branch `feat/m18-hosted-demo` from `main`; one pull request.

## 8. Risks

| Risk                                                                | What is done about it                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The bill is higher than estimated                                   | A spending limit; the real figure read after a week; sleep as the lever                                                       |
| A demo on the open internet attracts sign-in attempts               | Rate limits and lockout exist; the password is not the one in the code; the data is fictional                                 |
| The "hosted demo" state weakens the production checks               | It is a separate named state with its own tests; production's checks are not touched; a test proves the two can't be combined |
| This computer has no Docker, so container files can't be tried here | They are tried on Railway's builder; the plan allows a few rounds there                                                       |
| The .apk can't be built while GitHub billing is blocked             | Question 4; the site works on a phone's browser in the meantime                                                               |
| The field-encryption key is lost                                    | It is kept in Railway's settings and nowhere else. The demo's licence numbers are made up, so a reseed fixes it               |
| Railway changes prices or limits                                    | The container files work on any host that runs containers; only the settings file is Railway's                                |
| The owner's card details                                            | Entered by the owner on Railway's site only                                                                                   |

## 9. Questions for the owner

My recommendation: **(1)** Railway, for the demo; **(2)** always on for the first week, then decide; **(3)** passkeys and app links later, as M18b; **(4)** fix GitHub's billing, which also brings back the automatic checks; **(5)** you choose the password and type it in yourself.

1. **The host:** still Railway (no Israeli region, fine for fictional data), or wait for a host in Israel?
2. **The cost:** about $8 to $13 a month with everything always on, not $5, with a $15 spending limit. Go ahead? And should it sleep when idle to stay near $5, accepting a wait after a pause?
3. **Passkeys in the app and email links that open the app:** in this milestone, or later as M18b?
4. **The .apk:** GitHub builds it, and GitHub is blocked by billing. Will you fix the billing, should I install the Android build tools on this computer (several GB), or should the app wait and the demo use the site on the phone's browser for now?
5. **The demo password:** you choose it and type it into Railway yourself; I never see it. Agreed? And who else gets the address?

## 10. Owner answers

Given on 2026-10-07: "start m16 for a 5$ plan on railway". On 2026-10-19 the owner said "run the github tests" (GitHub Actions ran again, so its billing block is gone), then: "i have made a paied plan (20$) on railway now i want to deploy the updated apk so i can download it on my phone and test it". Taken as approval of this plan with my recommendations in §9:

1. **The host is Railway,** on a paid plan the owner chose ($20 a month, above the Hobby plan this plan priced); always on, so question 2 falls away.
2. **Passkeys in the app and email links that open the app wait for M18b.**
3. **The .apk is built on GitHub,** which works again.
4. **The demo password:** the owner types it into Railway; Claude never sees it.
5. **Who else gets the address:** not answered yet; nobody until the owner says.
