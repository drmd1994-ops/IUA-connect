# M7 — Notifications and search: plan

- Status: **Approved by the owner on 2026-10-02**
- Date: 2026-10-02
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M7. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.2 (directory), §3.9 (notifications), §3.10 (search), §3.11 (broadcast)
  - `DATABASE_DESIGN.md` §3 (`notifications`, `notification_preferences`, `broadcasts`, `consents`), §5 (search columns)
  - `API_DESIGN.md` §4 (`/notifications`, `/me/notification-preferences`, `/me/consents`, `/members`, `/search`, `/admin/broadcasts`), §5 (rate limits)
  - `SECURITY_MODEL.md` (directory scraping, phishing broadcast)
  - Spec §27 (notifications), §32 (search), §6 (privacy controls)
  - Owner decision D9 (opt-in directory) and the owner's answer in §11

## 1. Goal and exit criteria

Members get notices in the app and by email, and choose for each kind of content whether they want it in the app, by email, both or neither. Admins send a message to members only after a second admin approves it. Anyone can search the site in Hebrew or English. Members who choose to be listed can be found by other members.

**Exit criteria (roadmap):**

- Anti-enumeration and rate-limit tests.
- Search relevance spot checks in Hebrew.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M7**

1. **Notifications in the app**
   - A bell in the header with the number of unread notices; `/account/notifications` with the list, "mark as read" and "mark all as read". A notice links to what it is about.
   - The count refreshes about once a minute while the page is open. No live connection (websockets) in this milestone.
   - Notices are stored as a kind plus its details and shown in the reader's language.
   - Notices older than 180 days are deleted by a daily job.
2. **Preferences: the member chooses what is sent (§11.1)**
   - `/account/notifications/preferences`: one row per kind of content, with two switches, **In the app** and **By email**.
   - The kinds and their starting settings (§11.3; the member can change every switch except the first row):

     | Kind                          | What it covers                                                                       | App at start | Email at start |
     | ----------------------------- | ------------------------------------------------------------------------------------ | ------------ | -------------- |
     | Account and membership        | Application decisions, membership changes                                            | always on    | always on      |
     | My events                     | Registered, moved up from the waiting list, reminders, an event changed or cancelled | on           | on             |
     | Messages from the association | Broadcasts sent by an admin                                                          | on           | on             |
     | News                          | A news item was published                                                            | on           | off            |
     | New events                    | An event was published                                                               | on           | off            |
     | Education                     | An education item was published                                                      | on           | off            |
     | Guidelines                    | A guideline entry was added or got a new version                                     | on           | off            |

   - Security emails (verifying an address, password reset, sign-in from a new device) are not notifications and can't be turned off.
   - The spec's other categories (CME, research, community, messages, governance) belong to Phase 2 features and are not shown until those exist.
3. **Notices about new content**
   - When news, an event, an education item or a guideline is published, everyone who may read it under its access tier and has that kind switched on gets a notice in the app.
   - **Email for new content is one daily summary** (§11.2): one email in the morning listing what was published since the last one, only to people who switched email on for those kinds, and only when there is something to list. Not one email per item.
   - Exam questions don't create notices.
4. **Notices that already exist as emails** (M2, M5, M6) also appear in the app, under "Account and membership" and "My events", and now follow the member's switches for "My events". Staff work emails (an application waiting for a director, an item sent back to an editor) also appear in the app for that staff member.
5. **Unsubscribing:** every email that a switch controls ends with a link that turns that switch off in one step, without signing in, and a link to the preferences page.
6. **Broadcasts (`/admin/broadcasts`)**
   - An admin writes a message (title and text, Hebrew required, English optional) and chooses the audience: all active members, or chosen membership types (§11.4).
   - It is sent only after **a different admin** approves it. The approver sees the text and the number of people it will reach. They can also reject it with a reason.
   - States: draft → waiting for approval → sent, or rejected (back to its author). A sent broadcast can't be changed.
   - Sending runs as a background job and never reaches the same person twice, also when the job is retried.
   - Permissions `broadcasts.create` and `broadcasts.approve` already exist (IUA admins). Every step is audited.
7. **Search (`/search`, and a search box in the header)**
   - One search over news, events (including session titles), education items, guidelines and listed members.
   - Results are grouped by type, best matches first, with the title and a short excerpt.
   - **Access tiers apply:** what the reader may not open is not found. Members are found only by signed-in active members.
   - **Hebrew-aware:**
     - Vowel marks are ignored and final letters are treated like regular ones (already in the stored search text since M3).
     - The start of a word matches ("אורול" finds "אורולוגיה").
     - A word typed with a one-letter prefix (ה, ו, ב, ל, מ, ש, כ) also finds the word without it, and the other way round, through a similarity match on titles.
     - Small typing mistakes in titles are tolerated by the same similarity match.
   - Built on PostgreSQL behind a `SearchProvider` interface, so another engine can replace it later.
   - Exam questions are not searched (the answers stay hidden).
8. **Member directory (opt-in, D9)**
   - On "My profile" a member switches on "List me in the member directory". The consent is recorded with its date and wording version, and can be withdrawn at any time; the member leaves the list at once.
   - `/members`: for **signed-in active members only**. It lists active members who opted in, searchable by name and filtered by hospital and subspecialty.
   - `/members/[id]`: the member's profile, showing only the fields they made visible to members or to everyone.
   - Someone who is not listed, or whose membership is no longer active, is "not found", the same as an address that never existed.
   - No export, 20 per page, and a rate limit (30 requests a minute per person).
9. **Demo seed:** a few fictional members opted in with different visible fields, notices of every kind for the demo members, one broadcast waiting for approval and one sent.

**Not in M7**

| Item                                            | Where                                 |
| ----------------------------------------------- | ------------------------------------- |
| Push notifications to phones                    | With the mobile app (after the MVP)   |
| Live updates of the bell (websockets)           | Not planned for the demo              |
| SMS or WhatsApp                                 | Not planned                           |
| Search over research, jobs, fellowships, cases  | Phase 2 (those features don't exist)  |
| Search inside attached files (PDF text)         | Not planned for the demo              |
| A dedicated search engine (OpenSearch)          | After the pitch, behind the interface |
| Messaging between members                       | Phase 2                               |
| Broadcast by subspecialty or hospital           | Not chosen (§11.4)                    |
| Scheduling a broadcast for a later time         | Not planned for the demo              |
| A public directory (visible without signing in) | Not planned (D9)                      |

## 3. Roles and rules (proposed defaults)

- **Who gets notices about new content:** verified, active accounts that may read the item. A members-only item notifies active members only.
- **An item published again** (taken down, edited, published) does not notify a second time.
- **Imported and seeded content** creates no notices.
- **Broadcasts**
  - Writing: `broadcasts.create`. Approving: `broadcasts.approve`, and never the author.
  - Audience is fixed at approval: the people who match at that moment receive it.
  - Members who switched "Messages from the association" off in the app don't get it in the app; the same for email.
  - Text is plain text with paragraphs and links shown as addresses. No images or attachments.
- **Directory**
  - Listed = opted in **and** active membership. Suspended and expired members are not listed.
  - The list shows the name and, when the member made them visible to members, the title, institution, subspecialties and photo. Private fields are never searched: a name the member keeps private can't be found by typing it.
  - A member who made nothing visible but opted in is listed with their name only. Opting in shows a notice saying that the name becomes visible to members.
  - Staff without a membership use the admin members screen, not the directory.
- **Search**
  - At least 2 characters. At most 5 results per type on the first page, with "show more" per type.
  - Rate limits: 60 searches a minute per person or address; the member part counts toward the directory limit too.
  - What was searched for is not logged with the person's identity.
- **Email consent:** the summary email and broadcast emails go only to verified addresses, and stop at once when the switch is turned off.

## 4. Database (migrations)

New tables: `notifications`, `notification_preferences`, `broadcasts`, `broadcast_translations`, `broadcast_deliveries`, `consents`.

- `notifications`: person, kind, details, link, read time. Index for "my unread, newest first".
- `notification_preferences`: person, kind, channel (app or email), on or off. A missing row means the starting setting.
- `broadcasts`: author, approver (**a check that it differs from the author**), state, audience, times. `broadcast_deliveries`: one row per broadcast and person (unique), so nobody receives it twice.
- `consents`: person, kind (directory now; the others when needed), wording version, given and withdrawn times. Kept as history.
- `profiles.directory_opt_in` (default off).
- Search: a normalised, searchable name on profiles (maintained by a trigger, like the content search text) with a similarity index. The content tables already have their search text and indexes.
- Enums: notification kind, channel, broadcast state, consent kind.

## 5. API (under `/api/v1`)

- **Notifications:** `GET /notifications` (paged, with the unread count), `POST /notifications/{id}/read`, `POST /notifications/read-all`.
- **Preferences:** `GET` and `PUT /me/notification-preferences`; `POST /notifications/unsubscribe` (the signed link from an email; public).
- **Consent and directory:** `GET` and `POST /me/consents`; `GET /members`, `GET /members/{id}`.
- **Search:** `GET /search?q=&types=`.
- **Admin:** `/admin/broadcasts` (list, create with `Idempotency-Key`, get, update a draft, submit, approve, reject, audience count).
- Every admin route gets the anonymous 401 / member 403 / admin-without-MFA 403 / admin 2xx tests.

## 6. Tests

- **Unit:** starting settings and how a stored switch overrides them; which kinds can't be turned off; who is in an audience; the broadcast steps and the two-admin rule; how a Hebrew query is prepared (vowel marks, final letters, prefixes, word starts); the unsubscribe link (expired, altered, for another person).
- **Integration:**
  - **Preferences:** a switched-off kind creates no notice and no email; "Account and membership" can't be switched off; the one-step unsubscribe works without signing in and only for its own kind.
  - **New content:** publishing notifies exactly the people who may read the item; publishing again doesn't notify twice; the daily summary lists each item once and is not sent when empty.
  - **Broadcasts:** the author can't approve; a second admin can; a retried send reaches nobody twice; the audience count matches who receives it; a sent broadcast can't be edited.
  - **Anti-enumeration (exit criterion):** a member who is not listed, a suspended member, an expired member and an address that never existed all give the same "not found", with the same shape of answer; private fields never appear and can't be matched by search; visitors and signed-in people without an active membership get nothing from `/members` or from the member part of search.
  - **Rate limits (exit criterion):** the directory and search limits are reached and answer "too many requests"; the real limits run in their own suite, like the sign-in limits.
  - **Search and tiers:** five kinds of reader each find only what they may open, in every type.
  - **Hebrew relevance spot checks (exit criterion):** a fixed set of fictional items and queries with the expected first result: with and without vowel marks, final letters, a word start, a prefixed word, a small typing mistake, and an English query.
  - The admin access pattern on every admin route.
- **End to end (Playwright):**
  - A member turns "News" email on; an editor's article is published; the member sees the notice under the bell and opens the article; the summary email lists it; the unsubscribe link switches it off.
  - An admin writes a broadcast; they can't approve it; a second admin approves; a member sees it in the app and in the outbox.
  - A member opts into the directory; another member finds them by name in Hebrew and sees only the visible fields; a visitor can't open the directory.
  - A visitor searches in Hebrew and opens a result.
  - Axe checks on every new page in he and en.

## 7. Order of work (a commit at each checkpoint; tests green at each)

1. Schema; notifications and preferences API; existing emails also create notices and follow the switches.
2. Notices and the daily summary for new content; the unsubscribe link.
3. Broadcasts: admin API, two-admin approval, sending.
4. Consents and the directory API, with the anti-enumeration and rate-limit tests.
5. Search API with the Hebrew checks.
6. Web: bell, notifications list, preferences; directory opt-in, list and profile; search box and page.
7. Web: admin broadcasts. Demo seed; end-to-end tests and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/notifications-search`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

No new libraries are planned.

## 8. Risks

| Risk                                                  | Mitigation                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A taken-over admin account messages every member      | Two-step verification for admins (M1); a second admin must approve; every step audited                                     |
| Too many emails, so members ignore or resent them     | New-content email is off at the start and arrives as one daily summary; every switch is the member's; one-step unsubscribe |
| The directory is copied in bulk                       | Opt-in; active members only; 20 per page; rate limit; no export; private fields never searched                             |
| Finding out whether someone is a member               | The same "not found" for not listed, not active and never existed; tested                                                  |
| Search shows something the reader may not open        | Tiers applied inside the search query, not after it; tested per kind of reader                                             |
| Hebrew search quality with a general-purpose database | Normalised text, word starts and similarity matching; fixed spot checks; another engine can replace it later               |
| Sending to thousands of people from one request       | A background job in batches; a delivery row per person so retries are safe                                                 |
| Notices pile up                                       | Deleted after 180 days                                                                                                     |

## 9. Questions for the owner

Asked on 2026-10-02; answers in §11.

## 10. Checkpoint test

After M7 the owner tests the demo: the bell and preferences as a member, a broadcast with two admins, the directory with two members, and search in Hebrew.

## 11. Owner answers

1. **Choosing what is sent (2026-10-02):** the member can choose which content is sent as notifications, and turn each kind on or off for email and for the app.
2. **Email about new content:** **one daily summary**, only to members who switched email on, and only when there is something new.
3. **Starting settings:** **as proposed.** Email for new content starts off; notices in the app start on; account, my events and messages from the association start on for both.
4. **Broadcast audience:** **all active members, or chosen membership types.**
5. **Directory:** signed-in active members only (D9), approved with the plan.
