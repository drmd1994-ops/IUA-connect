# M18: the demo on a hosted service (Railway)

**Status: proposed on 2026-10-07, rewritten the same day for Railway after the owner said "start m16 for a 5$ plan on railway". Not approved yet: the choice of host is the owner's and is taken as given; the rest of this plan, and the cost in §5, wait for the owner's word. Nothing of it is built.**

Track: Operate. Size: M. Needs first: a Railway account opened by the owner (Claude does not open accounts or enter payment details).

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. Deferred by the owner on 2026-10-13 ("for now we continue the build without a server"). The host is not chosen: this text is the Railway version; the owner then asked for hosts in Israel and has not picked one. When it is taken up again it is hosted under the product's new name, in the operator's own account, and after M16 and M17, so that what is hosted is already the independent product. The demo's organisation stays fictional until the real association agrees to be shown.

## 1. What I checked before writing this

- **Railway's own pages, on 2026-10-07.** The Hobby plan is "$5 / month" and includes "$5 of resource usage per month"; above that "you will be charged the delta". Usage costs $10 per GB of memory per month, $20 per processor per month, $0.15 per GB of disk per month, $0.05 per GB sent out. A payment card is required.
- **Each service gets a free `…up.railway.app` address with a certificate** that renews by itself. No domain has to be bought, and the address carries no association's name.
- **Live chat fits Railway's limits.** A request may stay open up to 15 minutes while data flows and is closed after 5 minutes of silence. The chat stream sends a small "still here" event at least every 30 seconds and closes itself every 10 minutes, so it stays inside both.
- **The repository has no container files and no Railway settings.** CI builds with `pnpm build`. Both are added here.
- **The site already reaches the server through its own address** (`/api/v1/...` is passed on by the site to the server). So a browser talks to one address only, and the sign-in cookie keeps working as it does today. The app talks to the server's address directly.
- **The server refuses to start as "production" with the demo's stand-ins** (files on disk, emails to a folder, no virus scan), and with keys marked "dev". A hosted demo is neither development nor production; it needs a third, named state.
- **The demo password is written in the repository** (`apps/api/prisma/seed/demo.ts`). The repository is private, but a demo on the open internet must not use a password that is written down in its code.

## 2. Goal and exit criteria

**Goal:** the demo works with the owner's computer switched off. The site, the server, the database and the files run on Railway at fixed addresses; the app and a rebuilt .apk use them.

**Exit criteria**

- The site opens at its Railway address from any network; a demo account signs in; a chat message sent in one browser arrives live in another.
- The installed .apk, rebuilt with the hosted address, signs in and shows live chat with this computer off.
- A new version is put on Railway by one documented step, and the demo data can be wiped and seeded again by one documented step.
- The server still refuses to start as real production with any demo stand-in. The existing suites pass unchanged.
- CI green, `PROJECT_STATUS.md` updated, a demo.

## 3. Scope

**In**

1. Three services in one Railway project: the server, the site, and Railway's PostgreSQL. A disk ("volume") on the server for uploaded files and the email folder.
2. Container files for the server and the site, and Railway's settings kept in the repository, so the set-up can be rebuilt from nothing.
3. A named "hosted demo" state of the server (see §4 and §5).
4. The demo password taken from a secret setting on Railway, not from the code. The owner chooses it.
5. Start-up on Railway: database changes applied, the two database roles made as in development, the demo data seeded once.
6. A demo-only page for staff to read the emails the demo "sent" (today they are files on this computer).
7. The .apk rebuilt with the hosted address; an icon and a start screen of its own.
8. The tunnel kept and documented as the fallback.

**Moved out of this milestone, into M18b, if the owner agrees**

- Passkeys in the app, and email links that open the app. Both need the fixed address this milestone provides, and both need an app library and settings files served by the site. They are separable, and the demo is useful without them.

**Not in**

| Item                 | Where                                                |
| -------------------- | ---------------------------------------------------- |
| Real members' data   | M19 and M20                                          |
| A bought domain name | Not needed; can be added later in Railway's settings |
| Sending real email   | M19                                                  |
| Hosting in Israel    | M19 (Railway has no Israeli region)                  |

## 4. Rules

- **Demo data only.** The banner "all people and data shown are fictional" stays on every page and screen.
- **"Hosted demo" is its own state, never production.** In it the server allows the demo's stand-ins, and in exchange it requires: keys that are not marked "dev", a demo password that is not the one in the code, and the demo banner. It cannot be combined with the real production state, and the checks for real production are unchanged.
- **The database is not reachable from the internet.** The server reaches it over Railway's private network.
- **Secrets live in Railway's settings,** never in the repository. Claude does not see the owner's card or Railway password.
- **Nothing is deployed from a branch that did not pass CI.**

## 5. What is built

- **Server:** the "hosted demo" state in the settings check, with tests for every combination that must be refused; the demo seed reading its password from a setting; the staff's page of sent emails (demo only, refused in production).
- **Site:** the server's private address given at build time (the site's pass-through is fixed when the site is built).
- **Repository:** `apps/api/Dockerfile`, `apps/web/Dockerfile`, Railway settings files, a "Deploy" section in `DEPLOYMENT.md` with the one-step deploy and the one-step reset.
- **App:** the two repository variables changed to the hosted addresses; an icon and start screen; the .apk rebuilt by the existing workflow.
- **Database:** no change.

## 6. New tools, services and costs (each needs the owner's approval)

| What                                                           | Why                                                                             | Cost                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Railway account on the Hobby plan, opened by the owner       | The host                                                                        | $5 a month, which includes $5 of use                                                                                                                                                                                                                                                             |
| **Use above the included $5**                                  | Three services that never sleep                                                 | **My estimate: $3 to $8 more a month,** so $8 to $13 in all. Memory is the cost: the server, the site and the database together use about 0.7 to 1.1 GB, at $10 per GB. This is an estimate from how much memory they use on this computer; the first week on Railway will show the real figure. |
| Railway's command-line tool (`@railway/cli`), on this computer | So Claude can deploy and read logs after the owner signs in through the browser | Free                                                                                                                                                                                                                                                                                             |

**To stay near $5:** Railway can put a service to sleep when nobody uses it and wake it on the next request. For a demo that is used now and then this would roughly halve the cost. The price is a wait of some seconds on the first request after a pause, and background work (scheduled publishing, reminders) not running while asleep. Question 2.

**A spending limit** can be set in Railway's settings; I recommend $15 so a mistake cannot cost more.

## 7. Tests

- **Server (unit):** the settings check accepts "hosted demo" only with non-dev keys, a changed demo password and the stand-ins; refuses it together with real production; real production still refuses every stand-in. The seed uses the given password and refuses the one in the code when hosted.
- **Server (integration):** the sent-emails page is staff-only and absent in production.
- **Existing suites:** unchanged and green.
- **After each deployment, a smoke check kept as a script:** the site answers, the server's health address answers, a demo sign-in works, the chat stream opens and delivers its first event.
- **By hand:** the .apk with this computer off; two browsers for live chat.

## 8. Order of work (a commit at each step; tests green at each)

1. This plan approved; the owner opens the Railway account and signs the command-line tool in.
2. The "hosted demo" state and the demo password from a setting, with their tests.
3. Container files; both build and run on this computer's own Node first (no Docker here), then on Railway.
4. The Railway project: database, server with its disk, site; secrets set; first deployment; seed.
5. The smoke check; the deploy and reset steps written down.
6. The sent-emails page.
7. The app: addresses, icon, start screen; the .apk rebuilt and tried with this computer off.
8. One week's real cost read from Railway and written into the status; sleep on or off decided on that.
9. Documents, `PROJECT_STATUS.md`, demo.

**Git:** branch `feat/hosted-demo` from `main`; one pull request.

## 9. Questions for the owner

1. **The cost:** about $8 to $13 a month with everything always on, not $5. Go ahead on that basis?
2. **Sleep when idle,** to stay near $5, accepting a short wait after a pause? (Proposed: start always-on, read the real cost after a week, then decide.)
3. **Passkeys in the app and email links that open the app:** in this milestone, or as M18b afterwards? (Proposed: afterwards.)
4. **The demo password:** you choose it and type it into Railway yourself; Claude never needs to see it. Agreed?
5. **Who else gets the address?**

## 10. Risks

| Risk                                                                | What is done about it                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The bill is higher than estimated                                   | A spending limit; the real figure read after a week; sleep as the lever                                                            |
| A demo on the open internet attracts sign-in attempts               | Rate limits and lockout exist; the password is not the published one; the data is fictional                                        |
| The "hosted demo" state weakens the production checks               | It is a separate named state with its own tests; production's checks are not touched, and a test proves the two cannot be combined |
| This computer has no Docker, so container files can't be tried here | They are tried on Railway's builder; the plan allows a few rounds there                                                            |
| Railway changes prices or limits                                    | The container files work on any host that runs containers; nothing is tied to Railway but its settings file                        |
| The owner's card details                                            | Entered by the owner on Railway's site only                                                                                        |

## 11. Owner answers

Given on 2026-10-07, before this rewrite: "start m16 for a 5$ plan on railway". Taken as: **the host is Railway, on its $5 Hobby plan.** The address is Railway's own free one. The other questions of §9 are open.
