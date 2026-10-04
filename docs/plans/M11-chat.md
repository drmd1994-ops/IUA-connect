# M11 — Chat, part 1 (private chat): plan

- Status: **Approved by the owner on 2026-10-04**, with the recommended answer to every question (§12)
- Date: 2026-10-04
- Asked for by the owner: `chat.md.txt` in the project folder (private chat and public rooms, live, with moderation, reporting, blocking, attachments and privacy settings).
- Design sources:
  - `HANDOFF.md` §6 (the decisions this feature needs)
  - `DEVELOPMENT_ROADMAP.md` (messaging and community are Phase 2), `ARCHITECTURE.md` §4 (modules), §5 (adapters), §6 (permissions)
  - `SECURITY_MODEL.md` ("patient-adjacent content: cases, logbook, messaging. The highest sensitivity")
  - `docs/plans/M7-notifications-search.md` (notifications, the opt-in directory, search), `docs/plans/M3-content-core.md` (files), `docs/plans/M10-video-push-interfaces.md` (push)
  - Owner decisions D9 (opt-in directory) and D15 (PostgreSQL only for the demo)

## 0. How this plan treats the request

The request lists about a hundred capabilities and says "do not stop after creating a plan". The project's standing rule is a plan the owner approves first, one milestone at a time, and it stands. So:

- **The request is split into three milestones** (question 1). This plan is the first: the shared foundation and private chat. The table in §2 shows where every other item goes; nothing in the request is dropped silently.
- **The database and the API are designed once, for all three**, so rooms and attachments are added later without changing what M11 builds.
- **"Doctor/patient chats"**, named in the request as a future direction, are **not planned at all**. Patient information is not allowed anywhere in this project before a legal review (O6).

## 1. Goal and exit criteria

An active member opens **Chat** in the header, finds another member, and they write to each other. Messages arrive without refreshing the page. A member can reply, edit, delete, mute, archive, block and report. Staff review reports. Nobody else can read a conversation.

**Exit criteria**

- **Nobody outside a conversation can read it or learn that it exists:** changing an id in the address or in an API request answers "not found", tested for every chat route.
- **A message appears on the other person's open screen within two seconds**, with no refresh, on this computer.
- **A conversation of 10,000 messages opens as fast as one of ten** (newest 50 first, older ones on scrolling up; the query uses its index).
- The admin access pattern (anonymous 401, member 403, admin without two-step verification 403) on every admin chat route.
- No WCAG 2.2 AA violations (axe) on the new pages in Hebrew and English.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M11**

1. **The Chat section**
   - A "Chat" link in the header for signed-in active members, with the number of conversations that have unread messages.
   - `/chat`: the list of the person's conversations. `/chat/[id]`: one conversation.
   - Wide screens: the list on one side and the open conversation beside it, with a details panel that opens on request. Phones: the list is one screen and the conversation is the next. Hebrew is right to left.
   - It uses the existing design tokens and components. No new visual style.
2. **Starting a conversation**
   - "New conversation" searches by name among the people the member may write to (§3, question 3). The same "Send a message" button appears on a member's page in the directory.
   - Two people have exactly one conversation between them. Starting it again opens the existing one.
3. **Messages**
   - Plain text, up to 4,000 characters. Enter sends, Shift+Enter starts a new line. An empty message can't be sent.
   - **Reply** to a message (the reply shows a short quote of the original).
   - **Edit** your own message; it is then marked "edited".
   - **Delete for everyone** (your own message; it stays in place as "This message was deleted" and its text is erased from the database).
   - **Delete for me** (any message; it disappears from your side only).
   - **Copy.**
   - Each message has a menu that lists only what that person may do with that message.
   - Time on each message; a date line between days.
4. **Status of a message you sent:** sent, delivered, read (question 6). Delivered means the other person's app received it. Stored as two markers per person per conversation, not a row per message.
5. **Unread:** a count per conversation; opening a conversation marks it read; "Mark as unread" puts the mark back.
6. **Live updates** (question 2): new, edited and deleted messages, read status and "is typing…" arrive without refreshing. Typing is never stored. If the live connection is not available, the page refreshes every ten seconds instead, and says nothing about it.
7. **The conversation list:** photo (when the person shows it to members), name, the start of the last message, its time, the unread count and a "muted" mark. Newest activity first. A search field filters the list by name.
8. **Per conversation:** mute (8 hours, a week, or until switched back), archive (the conversation moves to "Archived" and comes back when a new message arrives, unless it is muted), open the other person's directory page.
9. **Search messages:** inside one conversation, and across all of the person's conversations, by text, with the sender and date shown. Hebrew-aware in the same way as the site search (vowel marks, final letters, word starts).
10. **Blocking:** block a person from the conversation or from their directory page; a list of blocked people with "unblock" under "Chat settings". Neither side can send to the other while a block exists. The blocked person is not told; their message is refused with a neutral "This message can't be delivered".
11. **Reporting:** report a message or a person, with a category and an optional description. Categories come from a table (seeded: harassment, spam, patient information, impersonation, other), not from the code.
12. **Chat settings (`/account/chat`)**
    - Who can write to me: the people allowed by question 3, or nobody.
    - Show others when I have read their messages: on or off. Whoever switches it off doesn't see it for others either.
    - Show others when I am typing: on or off.
    - Blocked people.
13. **Notifications**
    - A new kind in "Choose what you receive": **Private messages**, with the two usual switches.
    - In the app: the number on the Chat link. Messages do not fill the bell.
    - By email: at most **one email a day** saying that unread messages are waiting, with a link. The email never contains the text of a message or the sender's name. Proposed starting setting: app on, email on.
    - A muted conversation and a blocked person never cause a notice.
    - The push connection point from M10 is handed each new message notice. It still sends nothing.
14. **Staff: reports (`/admin/chat/reports`)**
    - A new permission, `chat.moderate`, for IUA admins (and super admins), only in a session with two-step verification.
    - The queue lists open reports. A report shows the reported message with a few messages around it (question 4), the category, the description, who reported and who is reported.
    - Decisions, each with a reason: dismiss; delete the message; suspend the person from chat (for a number of days, or until lifted). A suspended person can read but not send, and is told so.
    - Every look at a report and every decision is written to the audit log. The number of open reports joins the admin dashboard.
    - Staff have **no screen for browsing conversations**.
15. **A standing note above the composer:** "Do not write details that identify a patient." It is also a report category, and it goes into the known limitations: nothing technical stops a person from typing it.
16. **Demo seed:** a few fictional conversations between the demo members, in Hebrew and English, with unread messages, one muted conversation, one blocked pair and one report waiting for review. `pnpm demo:reset` rebuilds them.

**Not in M11, and where it goes**

| Item from the request                                                                                              | Where                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Public rooms: list, join, leave, categories, member count, room search                                             | M12 (its own plan)                                          |
| Rooms run by staff: create, edit, archive, lock, moderators, remove and ban people, announcements, pinned messages | M12                                                         |
| Reactions, @mentions, "several people are typing"                                                                  | M12 (they matter in rooms)                                  |
| Reporting a room; an admin screen for editing the report categories                                                | M12                                                         |
| Files and images in messages                                                                                       | M13, after question 5                                       |
| Online and "last active" status, and its privacy setting                                                           | M13                                                         |
| Group chats between members, forwarding a message, pinning a conversation                                          | M13 or later                                                |
| "Who can add me to group chats"                                                                                    | With group chats                                            |
| Voice and video calls                                                                                              | Not planned                                                 |
| Clinic chats, professional communities, topic rooms                                                                | They are kinds of room: M12 and after                       |
| Doctor/patient chats                                                                                               | **Not planned.** Needs a legal review first (O6)            |
| End-to-end encryption                                                                                              | Not planned. Messages are stored like the rest of the data  |
| Real push notifications to phones                                                                                  | With the mobile app (the connection point exists since M10) |
| A dedicated search engine                                                                                          | Not needed at this size                                     |

## 3. Rules (proposed; approved with the plan unless a question in §10 changes them)

- **Who may use chat:** signed-in people with a verified address and an active membership, the same test as the directory. A person whose membership ends keeps their conversations readable but can't send. Staff without a membership don't have chat.
- **Who may write to whom (question 3, recommended option):** a member may start a conversation with any member **listed in the directory** who has not set "nobody". A person who is not listed can't be found in chat and can't be written to first, but can answer in a conversation that already exists. Someone who can't be written to looks exactly like someone who doesn't exist (the directory's rule).
- **Leaving the directory or setting "nobody"** stops new conversations, not existing ones. Blocking is how an existing one is stopped.
- **Editing:** your own message, within 15 minutes of sending. **Deleting for everyone:** your own message, at any time.
- **Text:** plain text only. No HTML and no Markdown; it is shown as typed, so nothing a person writes can run in someone else's browser. Web addresses become links that open in a new tab.
- **Limits per person:** 30 messages a minute; 10 new conversations an hour; 10 reports an hour; 60 searches a minute; one "typing" signal every three seconds; three live connections at once.
- **A reported message is kept as it was** with the report, even if its sender deletes it afterwards, until the report is closed and for 90 days after.
- **Suspension from chat** is separate from disabling an account: the person keeps the rest of the site.
- **Account deleted:** the person's messages stay in the other person's conversation under "Deleted account", without text the person had already deleted.
- **How long messages are kept:** question 4.

## 4. Database (one migration set, following the existing conventions)

Private conversations and the future rooms share the same tables. Ids are the time-ordered ids the project already uses, so "newer than" and paging need no extra column.

- **`conversations`**: kind (`DIRECT` now; `ROOM` and `GROUP` are added by their milestones), the two people of a direct conversation as an ordered pair with a **unique constraint** (one conversation per pair), the last message and its time (for sorting the list), created and updated times. The room columns (name, description, category, visibility, locked) arrive with M12.
- **`conversation_members`**: conversation, person (**unique together**), role (`MEMBER` now), joined time, **last read message**, **last delivered message**, "marked unread", muted until, archived time. Indexes: by person (for "my conversations, newest first") and by conversation.
- **`messages`**: conversation, sender, text, the message it replies to, edited time, deleted time, the normalised search text (maintained by a trigger, like news). Index on (conversation, id descending), which serves paging and the unread count; a search index on the search text.
- **`message_hides`**: person and message, written only when someone uses "Delete for me".
- **`chat_blocks`**: who blocked whom (unique pair), when.
- **`chat_preferences`**: per person: who can write to me, read receipts, typing. A missing row means the starting settings.
- **`chat_report_categories`**: key, Hebrew and English name, order, active.
- **`chat_reports`**: reporter, the reported person and (when there is one) the message, category, description, the kept copy of the message and its surroundings, status (open, dismissed, upheld), reviewer, reviewed time, resolution and reason, created time.
- **`chat_suspensions`**: person, by whom, reason, from, until, lifted time.
- **Enums:** conversation kind, member role, who-can-write, report status. `NotificationKind` gets `MESSAGES`.
- **Deleting:** a conversation's rows go with the conversation; a message's sender becomes empty when the account is deleted (the message stays for the other person); reports keep their own copy.
- **Not created now:** reactions, attachments, pins, room bans. Each comes with the milestone that uses it, so no empty tables are presented as features.
- Migrations only add. Nothing existing is renamed, changed or deleted. Lines Prisma generates against the hand-written composite keys are removed by hand, as since M2.

## 5. API (under `/api/v1`, every route declared)

- **Conversations:** `GET /chat/conversations` (paged by cursor; `archived`, `q`), `POST /chat/conversations` (with a person's id; answers the existing conversation if there is one), `GET /chat/conversations/{id}`, `PATCH /chat/conversations/{id}/me` (mute, archive, mark unread), `POST /chat/conversations/{id}/read`, `POST /chat/conversations/{id}/typing`.
- **Messages:** `GET /chat/conversations/{id}/messages` (newest 50; `before` for older), `POST /chat/conversations/{id}/messages` (with `Idempotency-Key`, so a retry never sends twice), `PATCH /chat/messages/{id}`, `DELETE /chat/messages/{id}`, `POST /chat/messages/{id}/hide`.
- **People and search:** `GET /chat/people?q=` (who I may write to), `GET /chat/search?q=&conversationId=`, `GET /chat/unread-count`.
- **Live:** `GET /chat/stream`.
- **Settings and blocks:** `GET` and `PUT /me/chat-settings`; `GET /chat/blocks`, `POST /chat/blocks`, `DELETE /chat/blocks/{userId}`.
- **Reports:** `GET /chat/report-categories`, `POST /chat/reports`.
- **Admin (`chat.moderate`):** `GET /admin/chat/reports`, `GET /admin/chat/reports/{id}`, `POST /admin/chat/reports/{id}/resolve`, `GET /admin/chat/suspensions`, `POST /admin/chat/suspensions`, `POST /admin/chat/suspensions/{id}/lift`.

All chat routes are `@Authenticated()` and then check, in the service, that the caller is an active member **and a member of that conversation**. A conversation or message the caller has no part in answers "not found", never "forbidden". The existing permission guard, roles and sessions are used; there is no second sign-in or permission system. The typed client is regenerated.

## 6. How messages arrive live

The app has no live connection today (the bell asks once a minute). Recommended, and **without a new library**:

- **Server to browser: one open stream per tab** (`GET /chat/stream`, Server-Sent Events, which NestJS has built in). The browser sends messages with the ordinary requests in §5 and listens on the stream. The web app reads the stream with the browser's own `fetch`, so the sign-in token travels in a header as it does everywhere else, and never in an address.
- **Between the parts of the server: PostgreSQL's own notify and listen**, behind a small `RealtimeBus` interface in `apps/api/src/infra/realtime/`, like the other adapters. It works with several API processes, and Redis can replace it later (D15).
- **Events:** message new, edited, deleted; read and delivered markers moved; typing; conversation changed. An event names only ids; the browser then asks for what it may see, so the stream can't leak text to the wrong person.
- **After a dropped connection** the browser reconnects and asks for what it missed since the last message it has. If the stream can't be opened at all, it falls back to asking every ten seconds.
- **To check at the first step:** that the web server's forwarding of `/api/v1` passes a stream through without holding it back. If it doesn't, the fallback is the first version and I come back to you before choosing anything else.
- **Possibly one line in `package.json`:** the PostgreSQL driver (`pg`) is already installed through Prisma. If the listener needs it named directly, I will ask before adding it.
- Written down as ADR 0009.

A WebSocket library (the alternative in question 2) would add two-way sockets. Chat doesn't need them: sending is an ordinary request either way.

## 7. Tests

- **Unit:** who may write to whom (listed, "nobody", blocked, suspended, membership ended); the edit window; what each person's message menu contains; unread and status from the two markers; mute and archive rules; when the daily email is due; how a Hebrew search text is prepared.
- **Integration**
  - **Access:** an anonymous caller gets 401 on every chat route; a signed-in person without an active membership gets "members only".
  - **Private chat:** A writes to B and B reads it. C gets "not found" for the conversation, its messages, a single message, the read and typing routes, the search and the stream's events, by using A's and B's ids (**the exit criterion**). A can't edit or delete B's message. Editing after 15 minutes is refused.
  - **Blocking:** a blocked person can't send, isn't told why, and causes no notice. Unblocking restores it.
  - **Who can be found:** not listed, "nobody", suspended membership and never existed all give the same empty answer from `/chat/people`.
  - **Status and unread:** counts are right after sending, reading, "mark as unread", delete for everyone and delete for me. With read receipts off, neither side sees "read".
  - **Input:** empty text, text over the limit, a reply to a message from another conversation, unknown fields, script tags and HTML in text (stored and returned as plain text).
  - **Limits:** the message, new-conversation and report limits answer "too many requests" (the real limits in their own suite, as for sign-in).
  - **Live:** an event reaches the two members of a conversation and nobody else; typing is not stored anywhere.
  - **Notifications:** one email a day at most, without message text; none for a muted conversation or a blocked person; the switches are followed.
  - **Reports:** a report keeps the message after its sender deletes it; a member can't open the queue; the admin access pattern on every admin route; each look and each decision is audited; a suspended person can read and can't send.
  - **Size:** a conversation of 10,000 messages pages correctly from newest to oldest with no gap and no repeat, the paging and unread queries use their indexes (`EXPLAIN`), and a person with 500 conversations gets the first page of the list in one query.
  - **Nothing else moved:** the existing 351 integration tests pass unchanged.
- **End to end (Playwright)**
  - Two members in two browser windows: one finds the other, writes in Hebrew; the other sees it arrive without refreshing, replies; the first sees "read". Edit and delete are seen on both sides.
  - Mute, archive, "mark as unread", search inside the conversation.
  - Block, and the refused message. Report; an admin opens the queue, deletes the message and suspends the person; the person sees that they can't send.
  - A third member can't open the conversation by its address.
  - The phone layout at 320 px; keyboard only; axe checks on every new page in he and en.
- The ZAP scan in CI runs as before; anything new it reports is fixed or brought to you.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. This plan, approved. Then: the stream passing through the web server proved on its own, ADR 0009.
2. Schema and migration; the chat module (`apps/api/src/modules/chat/`): conversations, messages, markers, with the access tests.
3. Blocks, settings, who-may-write-to-whom, limits.
4. Live: the bus, the stream, events, typing.
5. Search; the notification kind and the daily email.
6. Reports, suspensions and the admin routes; the permission and its role mapping.
7. Web: the Chat link, the list, the conversation, the composer and the message menu (`apps/web/src/features/chat/`), all text in `packages/i18n` (he and en).
8. Web: chat settings, blocking and reporting; the admin reports screen.
9. Demo seed; end-to-end tests and accessibility; documents (`ARCHITECTURE.md`, `API_DESIGN.md`, `DATABASE_DESIGN.md`, `SECURITY_MODEL.md`, `TESTING.md`, `docs/demo/KNOWN_LIMITATIONS.md`, `docs/demo/DEMO_SCRIPT.md`, `DEVELOPMENT_ROADMAP.md`); `PROJECT_STATUS.md`; demo.

**What existing code is touched** (everything else is new files): the header (`site-header.tsx`) for the link; the directory member page for "Send a message"; the admin shell and dashboard for the reports entry and count; `packages/shared` for the permission, the role mapping and the notification kind; the notification preferences page (it lists kinds from the shared catalogue); the i18n layout list of message groups; `schema.prisma`; the seed and `demo-reset.ts`; the app module's imports.

Git: branch `feat/chat` from `main`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

## 9. Risks

| Risk                                                        | What is done about it                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient details typed into a chat                           | The standing note; a report category; staff can delete; written in the known limitations; **a legal review before any real use** (O6)               |
| Someone reads a conversation that isn't theirs              | Membership of the conversation checked in the service on every route; "not found" for everything else; tested per route; live events carry only ids |
| Staff reading private messages                              | No browsing screen; a report shows only the message and its surroundings; every look is audited (question 4)                                        |
| Harassment or spam                                          | Opt-in reachability, "nobody", blocking, limits per person, reports, suspension                                                                     |
| Finding out who is a member                                 | `/chat/people` answers like the directory: not listed, not active and never existed look the same                                                   |
| The live stream is held back by the web server's forwarding | Proved first (step 1); the ten-second fallback always exists                                                                                        |
| Many open connections on one server                         | Three per person; a heartbeat closes dead ones; fine for a demo, **not load-tested**, and said so in the known limitations                          |
| Messages are readable by whoever can read the database      | Stated plainly: no end-to-end encryption. Encryption of the disk and backups is on the readiness checklist                                          |
| The milestone is large                                      | Rooms, reactions, attachments and status are kept out; nine checkpoints, each green                                                                 |
| Something existing breaks                                   | Only additions to the database; the existing suites must pass unedited                                                                              |

## 10. Questions for the owner

Each has a recommended answer. Answers are recorded in §12.

1. **How much comes first?**
   - **(a) Recommended:** three milestones. M11 private chat (this plan), M12 public rooms and their moderation, M13 files and online status.
   - (b) Private chat and public rooms together in M11. Roughly twice the work before you can test anything.
   - (c) Public rooms first, private chat second.
2. **How do messages arrive?**
   - **(a) Recommended:** live, with what the project already has (§6). No new library.
   - (b) Live with a WebSocket library (new, needs your approval). No visible difference for chat as planned.
   - (c) Not live: the page asks every few seconds. Simplest, and "is typing…" is dropped.
3. **Who can a member write to?**
   - **(a) Recommended:** only members who chose to be listed in the directory, and each of them can set "nobody". Chat follows the consent you already decided on (D9).
   - (b) Any active member, listed or not. Each can set "nobody". This lets a member confirm that a named person is a member, which the directory was built to prevent.
   - (c) Chat is its own opt-in, separate from the directory.
4. **What may staff read, and how long are messages kept?**
   - **Staff, recommended:** never a conversation as such. Only a reported message with the five messages before and after it, and every look is recorded. Alternatives: the reported message alone; or the whole conversation once reported.
   - **Kept, recommended:** until a person deletes them or the account is deleted, with no automatic deletion for the demo, and the real period decided in the legal review. Alternative: delete automatically after a period you name (for example 24 months).
5. **Files and images in messages?**
   - **(a) Recommended:** not in M11. Between doctors, images and documents are where patient details travel. Decide with the legal review, then M13.
   - (b) In M13 regardless of the review, with the existing upload rules (JPEG, PNG, PDF, DOCX, PPTX; type detected from the content; signed five-minute links; only the two people can open them).
   - (c) In M11.
6. **Read status and "is typing…": on at the start?**
   - **(a) Recommended:** both on, and each person can switch theirs off.
   - (b) Both off until a person switches them on.
   - (c) Not at all in M11 (only "sent").

Two smaller points I will follow unless you say otherwise: the daily "messages are waiting" email starts **on**; a message can be edited for **15 minutes**.

## 11. Checkpoint test

After M11 the owner tests the demo with two browser windows: `member.full@demo.test` writes to another listed demo member and sees the answer arrive; mute, archive, block; a report, then `admin@demo.test` at `/admin/chat/reports`. The demo script gets a short chat section.

## 12. Owner answers

Given on 2026-10-04: "start with creating M11 as you recommend". The recommended answer to each question stands:

1. **How much comes first:** three milestones. M11 is private chat; public rooms are M12; files and online status are M13.
2. **How messages arrive:** live, with what the project already has (§6). No new library.
3. **Who a member can write to:** members listed in the directory, each of whom can set "nobody".
4. **Staff and keeping:** staff see only a reported message with the five messages before and after it, and every look is recorded. Messages are kept until a person deletes them or the account is deleted; the real period is decided in the legal review.
5. **Files and images:** not in M11. Decided with the legal review, then M13.
6. **Read status and "is typing…":** both on at the start; each person can switch theirs off.

The two smaller points stand as proposed: the daily "messages are waiting" email starts on, and a message can be edited for 15 minutes.
