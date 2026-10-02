# M9 — Pitch readiness: plan

- Status: **Approved by the owner on 2026-10-02**
- Date: 2026-10-02
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M9. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §4 (accessibility: WCAG 2.2 AA and IS 5568; performance: largest paint under 2.5 s on public pages)
  - `SECURITY_MODEL.md` §5 (dynamic scan: OWASP ZAP baseline)
  - `DEPLOYMENT.md` (what comes before real data)

## 1. Goal and exit criteria

The demo is ready to be shown: it runs from start to finish on the owner's machine following a written script, it has been checked for accessibility, speed and common web weaknesses, and what it doesn't do is written down honestly.

**Exit criteria (roadmap):**

- The demo runs end to end on the owner's machine.
- Known limitations are documented.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

This milestone adds no product features. It fixes what the checks find.

## 2. Scope

**In M9**

1. **Demo script (`docs/demo/DEMO_SCRIPT.md`)**
   - A walk-through in the order a pitch would follow, about 15 minutes: visitor → member → department director → association admin → super admin.
   - For each step: which account, which page, what to click, what the audience should see, and what to say in one sentence.
   - A short version (5 minutes) made of the strongest steps.
   - A "before you start" list (database, servers, browser, language) and a "if something goes wrong" list.
2. **One command to prepare the demo**
   - `pnpm demo:reset`: empties the development database, loads the migrations and all seed layers, and clears the outbox and uploaded files, so every pitch starts from the same state. It asks for confirmation and refuses to run anywhere but the development database.
   - Demo accounts for every role already exist. Staff accounts need two-step verification at first sign-in, which interrupts a live demo; how to handle that is §7, question 1.
3. **Accessibility audit**
   - **Automated:** the axe checks already run on every page. Added here: the same checks on the signed-in pages that only the per-feature tests cover today, collected into one report, and a keyboard-only pass by Playwright over the main journeys (every control reachable, focus visible, no trap, focus moved sensibly after actions).
   - **Manual, by Claude from the code and the browser:** headings, landmarks, form labels and error messages, language and direction attributes on mixed Hebrew and English text, colour contrast of every token pair, text resized to 200%, reflow at 320 px.
   - **Manual with a screen reader (NVDA):** needs a person at the machine (§7, question 2). A checklist of about 12 journeys with what should be announced.
   - Findings are fixed in this milestone, or listed under known limitations with a reason.
   - **An accessibility statement page** (`/accessibility`, he/en), as Israeli regulation 35 expects of a public site: what was checked, known gaps, and how to report a problem. The contact comes from Settings.
4. **Performance pass**
   - Measured against the production builds on the owner's machine: largest paint, layout shift and total script size for the public pages (home, news list and article, events, education, guidelines, search), with a slowed-down connection.
   - Target: largest paint under 2.5 s (the requirement). Fixes where it is missed: what is loaded up front, image sizes, caching headers on the public API reads.
   - API: the slowest queries on the seeded data are read with `EXPLAIN`, and missing indexes are added.
   - The numbers go into `docs/demo/PERFORMANCE.md`, before and after.
5. **Security scan (OWASP ZAP baseline)**
   - A passive scan of the running site: security headers, cookies, information leaks, mixed content. It attacks nothing.
   - Where it runs is §7, question 3 (ZAP normally runs in Docker, which this machine doesn't use).
   - Findings are fixed, or recorded as accepted with a reason, in `docs/security/ZAP_BASELINE.md`.
   - Plus a re-read of `SECURITY_MODEL.md` against what was built, updating what changed.
6. **Known limitations (`docs/demo/KNOWN_LIMITATIONS.md`)**
   - Gathered from the "Deviations and findings" of every milestone, grouped for a reader who was not there: what is demo-only (mail to a folder, files on disk, rate limits in memory), what is not built (payments, CME, mobile app, the Phase 2 list), what needs a decision before real data (legal review, hosting, penetration test, the wording of consents), and what is rough (search without stemming, a bell that refreshes once a minute).
7. **README and documents polish**
   - README: a first page that someone new can follow in ten minutes (what it is, how to start it, the demo accounts in one table, where the script is).
   - `HANDOFF.md`, `ARCHITECTURE.md`, `API_DESIGN.md`, `DATABASE_DESIGN.md`: brought in line with what exists; things that were planned differently are corrected, not left to mislead.
   - `DEPLOYMENT.md`: the real-data readiness gate as a checklist with an owner for each line.
8. **Clean demo data:** a last read of every seeded text in Hebrew and English for typos and for anything that could be taken for a real person or a real clinical recommendation.

**Not in M9**

| Item                                        | Where                        |
| ------------------------------------------- | ---------------------------- |
| New features                                | After the pitch              |
| A penetration test by a third party         | The real-data readiness gate |
| Hosting, a public address, real email       | The real-data readiness gate |
| Legal review of terms, privacy and consents | The real-data readiness gate |
| An active (attacking) security scan         | With the penetration test    |
| Load testing with many users                | Before real data             |
| The mobile app                              | After the MVP                |

## 3. Rules for this milestone

- **A finding is fixed or written down.** Nothing is quietly left.
- **Fixes stay small.** A finding that needs a redesign is recorded as a limitation with a proposal, and asked about.
- **No new libraries without asking.** Measuring tools that only run from the command line and are not added to the project (for example Lighthouse through `npx`) are covered by §7, question 4.
- **The sample exam questions stay unpublished** unless the owner has reviewed them. The script shows the review screen, and publishes one only if the owner has approved it beforehand.

## 4. Tests

- The keyboard pass and the extra axe pages join the browser suite, so they keep running in CI.
- `pnpm demo:reset` gets a test for its safety check (it refuses a database that is not the development one).
- Whatever is fixed gets a test where one is possible.

## 5. Order of work (a commit at each checkpoint)

1. `pnpm demo:reset`; the demo script, walked through once against a fresh database, fixing what breaks.
2. Accessibility: automated additions, the manual pass from code and browser, fixes, the statement page.
3. Performance: measure, fix, measure again.
4. Security scan and fixes; `SECURITY_MODEL.md` re-read.
5. Known limitations; README and documents; the seeded texts read through.
6. The NVDA checklist run (by whoever §7 decides), last fixes; `PROJECT_STATUS.md`; the demo walked through from the script by the owner.

Git: branch `feat/pitch-readiness`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

## 6. Risks

| Risk                                               | Mitigation                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| The demo breaks in front of the audience           | One reset command; a script with fallbacks; the short version; a walk-through by the owner    |
| Two-step verification stalls a live demo           | Decided in question 1 and rehearsed in the script                                             |
| An accessibility claim that isn't true             | The statement lists what was checked and how, and the known gaps; no claim of full compliance |
| The screen-reader pass is skipped for lack of time | It is its own checkpoint; if it isn't done, the statement and the limitations say so          |
| A scan finding that can't be fixed quickly         | Recorded with its risk and a plan; nothing is hidden                                          |
| `demo:reset` run against the wrong database        | It checks the database name and `NODE_ENV`, asks for confirmation, and is tested              |
| The medical sample questions shown without review  | They stay unpublished; the script says so                                                     |

## 7. Questions for the owner

Asked on 2026-10-02; answers in §9.

## 8. Checkpoint test

You walk through the demo from the script, on a freshly reset database, start to finish.

## 9. Owner answers (2026-10-02)

1. **Two-step verification in the pitch:** **a fixed authenticator secret** for the demo staff accounts, the same across resets, added to the owner's phone once. Demo accounts only. The secret is generated on the machine and kept in `.env`, not in the repository.
2. **Screen-reader (NVDA) pass:** **the owner does it with Claude's checklist.**
3. **ZAP scan:** **in CI on GitHub.** One pinned GitHub action is approved as a new dependency.
4. **Measuring speed:** **Lighthouse from the command line** (`npx`, not added to the project) is approved.
