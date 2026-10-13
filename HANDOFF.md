# HANDOFF — IUA Connect

_Written 4 October 2026 after milestone M10, updated 5 October 2026 after M11 (private chat), M12 (chat rooms) and M13 (groups, invitations and files). For whoever picks the project up next, person or AI._

Read this file, then `PROJECT_STATUS.md` (one section per milestone: what was delivered, what was verified, what is open). `CLAUDE.md` holds the standing rules.

The handoff written at the start of the project (27 September 2026) is kept as it was in `docs/product/HANDOFF_2026-09-27.md`. Where a decision record says "HANDOFF decision N", it means that file.

## 1. Goal

**IUA Connect, "the digital home of Israeli urology":** a web platform for the Israeli Urological Association. Members join and are verified, read news and guidelines, register for events, learn, get notifications and find each other; the association's staff run all of it from an admin area.

- **What it is today:** a private **demo**, built to be pitched to the association. It is not endorsed by or affiliated with the IUA or the Israeli Medical Association.
- **Owner:** a urology surgeon, the only developer for now.
- **The goal of the work so far:** a complete, honest MVP that can be shown start to finish. That goal is met (milestones M0 to M9), plus four additions the owner asked for: connection points (M10), private chat (M11), chat rooms (M12), and groups, invitations and files in chat (M13).
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

**The MVP is complete and merged, and so are private chat and chat rooms.** `main` is at M13 (pull request #18, commit `4feef55`), CI green.

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
| M11       | Private chat between members, live, with blocking, reports and staff review                | 2026-10-05 |

**What it runs on:** pnpm 10 and Turborepo, Node 24, TypeScript. API: NestJS 11, Prisma 7, PostgreSQL 16 (portable install at `C:\Users\PC\tools\pgsql`). Web: Next.js 16 on port 3001, Hebrew (right to left) and English, Tailwind v4. Tests: Jest, Vitest, Playwright with axe.

**Test totals at M13:** API 301 unit and 466 integration tests; 110 browser tests. CI also runs lint, type check, a secret and dependency scan, an OWASP ZAP passive scan and the build.

**How to show it**

```powershell
pnpm demo:reset   # rebuilds the demo from nothing (deletes the development data)
pnpm dev          # then open http://localhost:3001
```

All demo accounts use the password in `README.md` ("Demo accounts"). Staff accounts also need a code from the authenticator entry in `outbox\demo-authenticator.svg`. The walk-through is `docs/demo/DEMO_SCRIPT.md`.

**Checked by the owner:** the demo walk-through and the screen-reader check with NVDA (both 3 October 2026), the ten sample exam questions (2 October 2026, loaded published since), and chat, rooms, groups and files with their Hebrew wording (M11, M12 and M13; 5 October 2026).

**Known gaps, all written down** in `docs/demo/KNOWN_LIMITATIONS.md`. The main ones:

- No payments, no mobile app, no CME tracking, no community features, no video hosting, no real email (emails are written to the `outbox` folder).
- **Chat is not reviewed for real use.** Messages are not end-to-end encrypted, and nothing technical stops someone typing patient details or sending a patient's picture. **Files and video in messages (M13) are in the demo ahead of the legal review,** by the owner's decision; a video keeps what the phone wrote into it and is not checked for viruses. Staff can't read a group that members made. The screen-reader check was not repeated for the chat pages, and the number of open connections one server holds was not tested.
- No legal review, no penetration test, no load test.
- The speed target is met only in part: main content appears at about 3.0 s on a simulated slow phone, against a target of 2.5 s (`docs/demo/PERFORMANCE.md`).
- Three planned "interface only" items were never built: `PaymentProvider` with the `payments` and `invoices` tables, `IdentityProvider`, `MembershipSource`. The owner decided on 5 October 2026 to leave them; each comes with the feature that needs it.
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
| `apps/api/src/modules/`                | One folder per feature: auth, users, profiles, membership, institutions, news, guidelines, events, education, notifications, search, chat, files, access, audit, admin, health. A module is imported only through its `index.ts` |
| `apps/api/src/infra/`                  | Adapters behind interfaces: mailer, storage, jobs, rate limit, crypto, since M10 video and push, and since M11 realtime |
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

**Touched most recently (M13, M12 and M11, and M9, M10 before them)**

- M13: in `apps/api/src/modules/chat/`, `groups.service.ts`, `invitations.service.ts`, `activity.service.ts`, `groups.controller.ts`; in `apps/api/src/modules/files/`, the chat upload, video and serving a part of a file; `apps/api/src/infra/storage/`; migrations `20261005150000_chat_group_enums`, `20261005150100_chat_groups`, `20261005150200_chat_message_files_only`; `apps/api/prisma/seed/demo-groups.ts`; `apps/api/test/chat-groups.int-spec.ts`.
- M13, web: in `apps/web/src/features/chat/`, `group-view.tsx`, `invitations.tsx`, `invite-panel.tsx`, `chat-extras.tsx` (forwarding, "go to this message"), and files in `message-parts.tsx`; `packages/i18n/src/messages/{he,en}/groups.json`; `apps/web/e2e/groups.spec.ts`.

- M12: in `apps/api/src/modules/chat/`, `rooms.service.ts` (rooms for members and moderators), `rooms-admin.service.ts` (staff), `rooms.controller.ts`, `room-notifier.ts` (mentions, replies, announcements), `chat-messages.ts` (what private chat and rooms share: paging, sending, views, reactions); migrations `20261005090000_chat_room_enums` and `20261005090100_chat_rooms`; `apps/api/prisma/seed/demo-rooms.ts`; `apps/api/test/chat-rooms.int-spec.ts`.
- M12, web: in `apps/web/src/features/chat/`, `room-view.tsx`, `rooms-list.tsx`, `message-parts.tsx` (the message menu, reactions and message box, shared with private chat); `apps/web/src/features/admin/chat-rooms.tsx`; `packages/i18n/src/messages/{he,en}/rooms.json`; `apps/web/e2e/rooms.spec.ts`.
- `apps/api/src/modules/chat/` (the chat API), `apps/api/src/infra/realtime/` (events between server processes), migration `20261004120000_chat`, `apps/api/prisma/seed/demo-chat.ts`.
- `apps/web/src/features/chat/` (the chat screens), `apps/web/src/features/admin/chat-reports.tsx`, `packages/i18n/src/messages/{he,en}/chat.json`, `apps/web/e2e/chat.spec.ts`.
- `apps/api/src/modules/auth/sessions.service.ts` (a renewal whose answer was lost can be repeated for 10 seconds).

- `apps/api/src/infra/video/`, `apps/api/src/infra/push/` and their use in `modules/education/` and `modules/notifications/notifier.ts`.
- `apps/web/src/features/auth/login-form.tsx` (where sign-in lands).
- `apps/api/prisma/seed/demo-education.ts` (exam questions load published).
- `docs/demo/` (script, limitations, performance, NVDA checklist), `docs/security/ZAP_BASELINE.md`.

**Not part of the project:** `chat.md.txt` in the project folder is the owner's request for a chat feature. M11, M12 and M13 built it, apart from what was decided against (see section 6). It is not committed.

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

**M11, private chat** (plan: `docs/plans/M11-chat.md`; detail in `PROJECT_STATUS.md`)

- The owner's request (`chat.md.txt`) was split into three milestones. M11 is the shared foundation and private chat.
- **Chat** in the top menu: one-to-one conversations with members listed in the directory. Reply, edit for 15 minutes, delete for everyone or for me, sent/delivered/read, unread counts, mute, archive, search, blocking, reporting, chat settings.
- **Live** without a new library: server-sent events to the browser, PostgreSQL notify between server processes (ADR 0009). The page falls back to asking every ten seconds.
- **Staff** review reports at `/admin/chat/reports` (`chat.moderate`). They see the reported message and five on each side, never a conversation, and every look is audited.
- **Nine tables**, shared with the later rooms. Messages are numbered inside their conversation, so order never depends on clocks.
- A new notification kind, "Private messages": at most one email a day, never with the text.

**After M11 (5 October)**

- **A session no longer ends when a page reloads during a renewal.** A refresh token used less than 10 seconds ago is accepted once more if its replacement was never used. Any other reuse still ends the session.

**M12, chat rooms** (plan: `docs/plans/M12-chat-rooms.md`; detail in `PROJECT_STATUS.md`)

- **Chat** now has a Private side and a Rooms side. Staff open rooms; any active member browses them and joins, after being told that the room will see their name.
- **In a room:** messages with the writer's name, replies, the six reactions, @mentions of people in the room, pinned messages, announcements, an announcements room where only moderators write. Private chat got the reactions too.
- **Moderators** are members the staff appoint to a room. They pin, announce, delete a message, lock the room, remove and ban people, each with a reason in the audit log. A moderator has no power in another room.
- **Staff** (`chat.rooms.manage`) open, change, archive and restore rooms at `/admin/chat/rooms`, and keep the room categories and the report reasons. Staff with `chat.moderate` can read any room and act as its moderator. Private conversations stay closed to them.
- **Live in a large room:** an event names the room, not its people, so its size doesn't grow with the room (ADR 0009, updated).
- **Notices:** a new kind, "Chat rooms": a mention, a reply to you and an announcement, under the bell. Email about rooms is off unless the member switches it on.
- **Four new tables** and new columns on conversations and messages; additions only.

**M13, groups, invitations, online status and files** (plan: `docs/plans/M13-chat-groups-status.md`; detail in `PROJECT_STATUS.md`)

- **Groups** that members make, up to 50 people, with one admin. Staff can't read them; they see only a report.
- **Invitations:** nobody is put into a group or a room. An invitation gives nothing until it is accepted.
- **Rooms by invitation:** staff tick a box; the room is hidden from everyone who is not in it.
- **Online and "last active",** shown only to people who already talk with the person, with a switch. Online is not stored.
- **Files in messages:** pictures and PDF (10 MB), MP4 video (100 MB). The owner chose to build them before the legal review. A video is kept as sent.
- **Forwarding, pinned conversations, search by day, and opening a found message in its place.**
- Two new tables; the files module can now take an upload from disk and serve a part of a file.

## 5. Failed attempts

What was tried and did not work, so nobody tries it the same way again.

**In the product**

- **One notification row per member for each published item (M7).** It did not scale to a whole membership. Replaced by one announcement per item, worked out per reader when they look.
- **Loose typing-mistake tolerance in search (M7).** It matched unrelated words. Now it applies per word, to titles only, for words of four letters or more.
- **The speed target of 2.5 s (M9).** Not reached on a simulated slow phone with small fixes; it stays near 3.0 s. The real fix is to have the server send public pages complete, which changes every public page. Not done; proposed as the first task after the pitch.
- **"Interface only" items from the original plan.** Five connection points and two payment tables were promised and never created, and no milestone noticed until M9. Two were built in M10; three are still missing (section 6).
- **The M9 demo script said the admin area opens by itself after an administrator signs in.** It did not. Found by the owner in the walk-through; the behaviour was then changed to match.
- **A sample message to members said they could renew from "My membership".** The app has no such function. The text was corrected.

- **Ordering chat messages by their id (M11).** The project's ids are ordered by time only to the millisecond, so two messages in the same millisecond could change places. Messages are numbered inside their conversation instead.
- **Two API answer classes with one name (M11).** Chat's `UnreadCountDto` replaced the notifications one in the API document, and the bell's types were silently wrong. A test now refuses a second DTO class with a name already used.
- **Closing a dialog on its "close" event (M11).** In development React mounts a component twice, and the first one's close event shut the window that had just opened. Close on "cancel" (Escape) instead.

- **Adding an enum value and using it in one migration (M12).** PostgreSQL refuses to use a new enum value in the transaction that adds it. The values go in a migration of their own, before the one that uses them.
- **Answering "not found" for a room the member can see in the list (M12).** The plan said every refusal looks like an invented id. For a room that "Browse rooms" shows to every member that hides nothing, and the page could not tell "join first" from "gone". A member who has not joined gets a clear refusal (`chatRoomNotJoined`); everyone who may not see rooms at all still gets "not found".
- **A database rule that a message always has text (M11) broke messages that are only files (M13).** The server answered with an error until the rule was relaxed in a migration. When a rule is written into the database, a later feature that changes it needs a migration, not only code.
- **Letting the files module's general rules decide about chat files (M13).** They let an uploader, and staff who may upload, read any file. For a file of a message only the people of the conversation count, so chat files are checked by the chat module alone.

**In testing and CI**

- **Integration tests ran out of memory in CI.** Fixed by running them in one worker that is recycled (`--maxWorkers=1`, `workerIdleMemoryLimit`).
- **Browser tests hit the real sign-in rate limit in CI.** Fixed with `RATE_LIMIT_SCALE`, which the API refuses in production.
- **The first ZAP scan failed the build** with seven warnings. One was a real gap and was fixed; six are accepted with reasons.
- **A new advisory for `braces` turned the security job red** with no fixed version available. Accepted as a documented exception, with the owner's agreement.
- **Browser tests against `pnpm dev` lost their sign-ins (M11)** when the API restarted under them. Run them against the builds, as CI does: `pnpm build`, stop `pnpm dev`, then `$env:CI = '1'; pnpm --filter @medconnect/web e2e`. What makes the watcher restart was not found.
- **A browser test that waits for the network to go quiet never finishes on a chat page,** because the page keeps a connection open. Chat pages get their accessibility check in `chat.spec.ts` and `rooms.spec.ts`, not in the audit that visits every page.
- **Browser tests that leave their windows open (M13).** Contexts made with `browser.newContext()` stay open until the whole run ends. Late in a run one demo person had many chat windows, they fought over the three live connections a person may hold, and a reaction went missing once. The chat specs now close every context after each test.
- **Integration tests that sign several people up at the same moment failed now and then (M12)** with a dropped connection. Create the people one after another.
- **`pnpm db:reset` was never checked.** Prisma refuses to let an AI agent run it without the owner's explicit consent. Use `pnpm demo:reset`.

**In the way of working (worth knowing on this machine)**

- **Stopping a dev or production server task leaves its child processes alive** (the Next.js server, the API, the NestJS watcher). They keep the ports and can serve a mix of old and new builds. After stopping, check ports 3001 and 4000 and stop what is left.
- **Shell here-documents break on apostrophes**, and scripted find-and-replace with regular expressions damaged `ARCHITECTURE.md` once. Edit files with the editing tools, line by line.
- **Reading and writing a file through PowerShell's `Get-Content` and `Set-Content` mangles non-English characters** (M13: three characters in a script). Use the editing tools, or `[IO.File]::ReadAllText` and `WriteAllText` with UTF-8.
- **Markdown files do not open readably** on the owner's computer. Give the owner an HTML page, or a formatted copy in the browser.
- **Commit messages are checked** (commitlint): lower-case subject, lines of at most 100 characters.
- **A long-running `pnpm dev` was stopped by the system once** for low memory.
- **The owner rejected the first set of questions for M7** and asked for something more specific (a switch per kind of content, for email and for the app). Ask about what the user will see, not about mechanisms.

## 6. Next step

**The mobile app is next, and waits for the owner.** Its plan is written (`docs/plans/M14-mobile-app.md`, 5 October 2026) and **not approved**: no app code, and nothing installed, until the owner approves it and answers its six questions. Read its §1 first: what the server lacks for an app (sign-in outside a browser cookie, devices for push), why passkeys must wait for real hosting, and that this computer has no mobile tools.

**Nothing else is owed on chat:** the owner marked the checkpoint tests of M12 and M13 as good, and read their Hebrew texts, on 5 October 2026.

1. **Chat is built** as far as the owner's request goes. **Not planned at all:** chat between doctors and patients (patient information is not allowed anywhere in this project), voice and video calls. The request also says "do not stop after creating a plan". The project's rule is the opposite, and it stood for M11, M12 and M13.
2. **Left open by the chat milestones:** a screen-reader pass on the chat pages; a test of how many open connections one server holds; trying a real phone video in the browsers people use; a virus scanner that also checks videos.
3. **Still open from M9:** confirming the "who" column of the readiness checklist in `DEPLOYMENT.md` (who is responsible for each line before real members use the site).
4. **Proposed after the pitch,** each with its own plan: have the server send public pages complete (speed); then the readiness checklist, starting with the legal review, which for chat must also settle who moderates, how long messages are kept, what staff may read, and whether files and video may be sent at all; then the Phase 2 list in `DEVELOPMENT_ROADMAP.md`.
