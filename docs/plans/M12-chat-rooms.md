# M12 — Chat, part 2 (public rooms): plan

- Status: **Approved by the owner on 2026-10-05**, with the recommended answer to every question (§12)
- Date: 2026-10-05
- Asked for by the owner: "continue to M12" (2026-10-05). The request itself is `chat.md.txt` §3 (public chat), §4 (administration and moderation), §14 (room screen), and the parts of §7, §9, §16 that M11 left for rooms.
- Builds on: `docs/plans/M11-chat.md` (private chat, merged as pull request #14), [ADR 0009](../adr/0009-live-updates-by-event-stream.md) (live updates).
- Design sources: `SECURITY_MODEL.md` ("Chat"), `DATABASE_DESIGN.md` §8 (chat tables), owner decisions D9 (opt-in directory) and D15 (PostgreSQL only for the demo).

## 1. Goal and exit criteria

Members talk together in rooms that the association opens: a general room, a questions room, an announcements room and so on. A member finds a room, joins, reads and writes. Moderators keep order. Messages arrive live, as in private chat.

**Exit criteria**

- **Only people who may be in a room read it.** Someone who is not an active member, who was removed, or who is banned, gets nothing from a room, whatever id is put in a request. Tested for every room route.
- **Only moderators moderate.** A member who is not a moderator of that room is refused every moderation action, and a moderator of one room has no power in another. Tested per action.
- **A room with 2,000 members and 10,000 messages** opens as fast as a small one, and a message sent in it reaches an open page within two seconds on this computer.
- The admin access pattern (anonymous 401, member 403, admin without two-step verification 403) on every new admin route.
- No WCAG 2.2 AA violations (axe) on the new pages in Hebrew and English.
- Private chat keeps working exactly as it does: its suites pass unchanged.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M12**

1. **Rooms beside private chat**
   - The Chat page gets two tabs: **Private** (what exists) and **Rooms**. The number on the Chat link counts both.
   - **Rooms** lists the rooms the member joined, newest activity first, each with its unread count, and a **Browse rooms** screen.
2. **Finding and joining**
   - **Browse rooms** shows every open room: name, description, category, picture, and how many members it has. Search by name, filter by category.
   - **Join** and **Leave** are one press each. Before the first join the member is told that their name is shown to the people in the room (question 1).
   - A room page shows its name, description, member count, when it was created, and its moderators.
3. **Messages in a room**
   - Everything a private message has: plain text up to 4,000 characters, reply with a quote, edit for 15 minutes, delete your own, "delete for me", copy, report. Links as in M11.
   - Each message shows who wrote it (name and, when they show it, picture), with a link to their directory page when they are listed.
   - **"Several people are typing…"** when more than one person is.
   - **No "delivered" or "read" marks in rooms.** A room shows only what is unread for you.
   - The note "Do not write details that identify a patient" stays above the message box.
4. **Reactions** (question 5): a fixed set of six, shown under the message with a count. Press once to add yours, again to take it back. Also in private chat.
5. **Mentions:** typing `@` and the start of a name offers the room's members; a mention is highlighted and the person is notified.
6. **Pinned messages:** moderators pin up to five messages in a room; they are listed at the top of the room, each a link to its place.
7. **Announcements**
   - A room can be set so that **only moderators write** in it (an announcements room). Everyone else reads and reacts.
   - In any room a moderator can mark their own message as an **announcement**: it stands out, and the room's members are notified.
8. **Moderators** (question 3)
   - A moderator is a member of the room whom staff appointed for that room.
   - In their room a moderator can: delete any message ("removed by a moderator" stays in its place), pin and unpin, mark an announcement, **lock** the room (nobody writes, until unlocked or until a time), **remove** a person from the room, and **ban** a person from it (for a number of days, or until lifted).
   - A removed person can join again; a banned person can't, and is told so when they try.
   - Every moderation action is written to the audit log.
9. **Staff: rooms in the admin area (`/admin/chat/rooms`)**
   - A new permission, `chat.rooms.manage`, for IUA admins (two-step verification as always).
   - Create and edit a room: name and description in Hebrew (required) and English (optional), category, picture, "only moderators write".
   - **Archive** a room: it leaves the lists and becomes read-only for its members. Rooms are never deleted, so nothing that was said disappears by one press.
   - Appoint and remove moderators; see and lift bans.
   - **Room categories:** a small screen to add, rename and order them.
   - **Report reasons:** the screen for editing them, left open by M11.
10. **Reports**
    - A member can report a message in a room (as in M11) and **a room** as such.
    - Reports go to staff (`/admin/chat/reports`), with the reported message and the five around it. Staff can also delete the message, suspend the person from chat, or archive the room.
11. **Notifications**
    - A new kind in "Choose what you receive": **Chat rooms**. It covers: someone mentioned you, someone replied to you, and an announcement in a room you joined.
    - In the app these appear under the bell and link to the message. Ordinary room messages never fill the bell; they show as the unread number.
    - By email (question 6).
    - A muted room, and a person you blocked, cause no notice.
12. **Blocking in rooms:** messages from someone you blocked are folded ("message from someone you blocked", with a press to show it). They still can't write to you privately.
13. **Search:** the message search of M11 also finds messages in rooms the member is in, and can be limited to one room.
14. **Live:** new, edited and deleted messages, reactions, pins, lock, and removal arrive without refreshing. A person removed or banned sees it at once and stops receiving.
15. **Demo seed:** five room categories and six rooms (the last smaller point in §10), each with a few fictional messages in Hebrew and English, a pinned message, an announcement, reactions, one moderator, one ban and one reported room message. Nothing medical.

**Not in M12, and where it goes**

| Item                                                                  | Where                                            |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| Rooms by invitation ("private" rooms), and "who can add me to a room" | M13, with group chats (question 2)               |
| Members creating their own rooms                                      | Not planned (question 3)                         |
| Files and images in messages                                          | M13, after the legal review                      |
| Online and "last active" status                                       | M13                                              |
| Forwarding a message                                                  | M13 or later                                     |
| Threads under a message, polls, a "slow mode", scheduled messages     | Not planned                                      |
| Any emoji as a reaction (an emoji picker)                             | Not planned; it needs a library (question 5)     |
| Voice and video                                                       | Not planned                                      |
| Doctor/patient chats                                                  | **Not planned.** Needs a legal review first (O6) |
| Real push notifications                                               | With the mobile app                              |

## 3. Rules (proposed; approved with the plan unless a question in §10 changes them)

- **Who may see and join rooms:** signed-in people with a verified address and an active membership, the same test as private chat. A person whose membership ends keeps reading the rooms they are in and can't write, as in private chat. Visitors see nothing of rooms.
- **Joining shows your name** (first and last) to the people in the room, also if you are not listed in the directory. Your directory page is linked only if you are listed.
- **The member list** of a room is shown to people in the room. Everyone else sees only the number (question 1).
- **Leaving** keeps what you wrote. Your unread place is forgotten.
- **A moderator** must be an active member in the room. Staff appoint them; a moderator can't appoint another. A moderator can't remove or ban another moderator; staff can.
- **Staff and rooms** (question 4): staff with `chat.moderate` may open any room, read it, and act as a moderator there. Rooms are open to every member, so they are not private in the way a one-to-one conversation is. Private conversations stay as they are: staff see only a report.
- **Suspension from chat** (M11) also stops writing in rooms. **A ban** is for one room only.
- **Deleting:** your own message as in M11. A moderator's deletion leaves "removed by a moderator" and erases the text; the audit log records who, without the text.
- **Reactions:** one of each kind per person per message. Nobody is notified about a reaction.
- **Mentions:** only people in the room can be mentioned. At most ten in one message. "@everyone" does not exist; an announcement is how a whole room is told.
- **Notices:** a mention, a reply to you, or an announcement makes one notice. Not from a muted room, not from a blocked person, and not to someone who left.
- **Locking** stops writing for everyone but moderators. Reading, reacting and leaving still work.
- **Limits:** messages as in M11 (30 a minute per person); 60 reactions a minute; 20 joins an hour; an announcement at most once a minute per room.
- **Room names** are unique. A room has a name in Hebrew, and may have one in English; English readers see the Hebrew name with the usual note when there is none.
- **Pictures** are uploaded by staff through the existing upload (JPEG or PNG, re-encoded, signed links). Members never upload in M12.

## 4. Database (one migration set; only additions, except two enums that gain a value)

M11 built the tables to be shared, so a room is a conversation of a new kind.

- **`conversations`** gains: kind `ROOM`; `name_he`, `name_en`, `description_he`, `description_en`, `category_id`, `picture_file_id`, `moderators_only` (announcements room), `locked_until` and `locked` (lock), `archived_at`, `created_by`, `member_count`. A check keeps the pair columns for direct conversations and the name for rooms. A unique index on the room name.
- **`conversation_members`** gains the role `MODERATOR` (the role column exists since M11). Nothing else changes: `last_read_seq` already gives a room its unread count without a row per message.
- **`messages`** gains: `announcement` (yes or no), `removed_by` (set when a moderator or staff deleted it), and `mentions` (the ids of the people mentioned).
- **`message_reactions`**: message, person, reaction; unique together. Index by message.
- **`message_pins`**: conversation, message, who pinned it, when; at most five per room (checked in a trigger).
- **`conversation_bans`**: room, person, by whom, reason, from, until, lifted. Index by room and person.
- **`chat_room_categories`**: key, Hebrew and English name, order.
- **`chat_reports`** gains a nullable link to a reported room.
- **`notification_kind`** gains `ROOMS`.
- **Indexes for size:** rooms by category and last activity (the browse screen); members by room and role; the existing `(conversation, seq)` index serves paging and unread in rooms too.
- **`member_count`** is kept by the join and leave code inside its transaction, so the browse screen never counts rows.

## 5. API (under `/api/v1`, every route declared)

- **Rooms for members:** `GET /chat/rooms` (browse: `q`, `categoryId`, paged), `GET /chat/rooms/mine`, `GET /chat/rooms/{id}`, `POST /chat/rooms/{id}/join`, `POST /chat/rooms/{id}/leave`, `GET /chat/rooms/{id}/members` (paged; for people in the room), `GET /chat/room-categories`.
- **Messages:** the M11 routes (`/chat/conversations/{id}/messages`, `/chat/messages/{id}`, read, typing, hide, search) serve rooms too; a room's id is a conversation's id. Sending accepts `mentions` and, for moderators, `announcement`.
- **Reactions:** `PUT` and `DELETE /chat/messages/{id}/reactions/{reaction}`.
- **Moderation (a moderator of that room, or staff with `chat.moderate`):** `POST` and `DELETE /chat/rooms/{id}/pins/{messageId}`, `GET /chat/rooms/{id}/pins`, `DELETE /chat/rooms/{id}/messages/{messageId}`, `POST /chat/rooms/{id}/lock`, `POST /chat/rooms/{id}/unlock`, `POST /chat/rooms/{id}/members/{userId}/remove`, `GET` and `POST /chat/rooms/{id}/bans`, `POST /chat/rooms/{id}/bans/{banId}/lift`.
- **Reports:** `POST /chat/reports` also accepts a room.
- **Admin (`chat.rooms.manage`):** `/admin/chat/rooms` (list, create, get, update, archive, restore), `/admin/chat/rooms/{id}/moderators` (add, remove), `/admin/chat/room-categories`, `/admin/chat/report-categories`.

A room the caller may not read answers "not found". A moderation route answers "forbidden" to a member of the room who is not a moderator (they know the room exists), and "not found" to everyone else.

## 6. Live updates in a large room

In M11 an event lists the people it is for. That does not fit a room of thousands (ADR 0009 says so). In M12:

- **A room event names the room, not its people.** Each API process knows which rooms each open stream is in (read when the stream opens, kept current on join, leave, removal and ban), and passes the event to those streams.
- Private conversations keep the M11 way.
- New events: reaction changed, pins changed, room changed (locked, renamed, archived), and "you are no longer in this room".
- **Typing in a room** is sent at most once every three seconds per person, as in M11, and shown as one name or "several people".
- No new library.

## 7. Tests

- **Unit:** who may read, write and moderate (member, moderator, staff, ended membership, suspended, banned, locked room, announcements room); the reaction set; reading mentions out of a text; who gets a notice; the five-pin limit.
- **Integration**
  - **Reading (exit criterion):** not a member of the association, not in the room (for the routes that need it), removed, and banned each get nothing from every room route, with the same answer as for an invented id.
  - **Moderating (exit criterion):** each moderation action as an ordinary room member (refused), as a moderator of another room (refused), as the room's moderator (works) and as staff (works); a moderator can't act on another moderator.
  - **Joining and leaving:** the count follows; a banned person can't join; an archived room accepts nothing; twenty people joining at once give the right count.
  - **Messages:** an announcements room refuses a member's message; a locked room refuses everyone but moderators; a mention of someone outside the room is refused; over ten mentions are refused; HTML stays plain text.
  - **Reactions:** added once however often it is pressed; counted; only the fixed set; not in a room the person isn't in.
  - **Pins:** five at most; unpinned when the message is deleted.
  - **Notices:** a mention, a reply and an announcement each make one notice; none from a muted room, a blocked person, or to someone who left; the switches are followed.
  - **Live:** a room event reaches the open streams of people in the room and nobody else; after removal the stream stops receiving at once.
  - **Size (exit criterion):** a room of 2,000 members and 10,000 messages: the browse list, the room, a page of messages and the unread count each use their index (`EXPLAIN`), and a message sent is passed to one open stream without listing 2,000 people.
  - **Admin:** the access pattern on every new admin route; a room name used twice is refused; archiving and restoring; appointing a moderator who isn't in the room adds them.
  - **Private chat unchanged:** the M11 suites pass as they are.
- **End to end (Playwright)**
  - A member browses, joins a room, writes in Hebrew; a second member sees it arrive, reacts, replies with a mention; the first sees the reaction and gets the mention under the bell.
  - Staff create a room and a category, appoint a moderator; the moderator pins, posts an announcement, locks the room, deletes a message, bans a person, who sees at once that they are out.
  - A member reports a room message; staff see it and archive the room.
  - The phone layout at 320 px; axe on every new page and dialog in he and en.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. This plan, approved.
2. Schema and migration; rooms, joining and leaving, the browse list, with the reading tests.
3. Messages in rooms: announcements rooms, locking, mentions; live by room.
4. Reactions and pins.
5. Moderators: delete, remove, ban, lock; the moderation tests.
6. Staff: rooms, categories, moderators, report reasons; reporting a room; staff in rooms.
7. Notifications: the new kind, mentions, replies, announcements.
8. Web: the Rooms tab, browse, the room screen, reactions, mentions, pins.
9. Web: moderation in the room; the admin screens.
10. Demo seed; end-to-end tests and accessibility; documents; `PROJECT_STATUS.md`; demo.

**What existing code is touched:** the chat module and screens from M11 (extended, not rewritten); the notification kinds; the admin shell and dashboard; the seed. Everything else is new files.

Git: branch `feat/chat-rooms` from `main`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

No new libraries are planned.

## 9. Risks

| Risk                                                   | What is done about it                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient details posted to many people at once          | The standing note; the report reason; moderators and staff can delete at once; said plainly in the known limitations; **the legal review before real use** |
| A room turns hostile, or is flooded                    | Moderators on the spot (delete, lock, remove, ban); per-person limits; reports to staff; suspension from all chat                                          |
| A moderator misuses the role                           | Every action is audited; a moderator can't act on another moderator; staff appoint and remove them                                                         |
| Joining a room reveals that someone is a member        | Only active members see rooms at all; the member is told before the first join; the member list is for people in the room                                  |
| A mention used to pester                               | Only people in the room; ten at most; muting the room stops the notices; blocking stops that person's                                                      |
| A large room is slow, or floods the server with events | Events by room, not by person; counts kept, not counted; indexes checked with `EXPLAIN`; **not load-tested**, and said so                                  |
| Private chat breaks while it is extended               | Its suites must pass unedited                                                                                                                              |
| The milestone is large                                 | Ten checkpoints, each green; by-invitation rooms, files and status are kept out                                                                            |

## 10. Questions for the owner

Each has a recommended answer. Answers are recorded in §12.

1. **Who can join a room, and what do others see of them?**
   - **(a) Recommended:** any active member can join any room. Their name is shown to the people in the room, and they are told so before the first join. The list of members is shown to people in the room; everyone else sees only the number.
   - (b) Only members listed in the directory can join.
   - (c) Any active member, and nobody sees a list of members, only the names on messages.
2. **Open rooms only, or also rooms by invitation?**
   - **(a) Recommended:** open rooms only in M12. Rooms by invitation come in M13 with group chats, because both need "who can add me".
   - (b) Both in M12. About a third more work.
3. **Who opens rooms, and who moderates?**
   - **(a) Recommended:** staff open rooms. Moderators are members whom staff appoint for a room.
   - (b) Staff only: no member moderators, staff do all moderating.
   - (c) Members can also open rooms themselves.
4. **What may staff do in rooms?**
   - **(a) Recommended:** staff with the chat permission can open any room, read it, and act as a moderator. (Private conversations stay closed to staff, as in M11.)
   - (b) Staff act only on reports, and never open a room unless they joined it as members.
5. **Reactions**
   - **(a) Recommended:** a fixed set of six (thumbs up, heart, laugh, surprise, thanks, check mark), in rooms and in private chat.
   - (b) Rooms only.
   - (c) No reactions in M12.
6. **What reaches a member by email about rooms?**
   - **(a) Recommended:** nothing at the start. In the app: mentions, replies to you and announcements, under the bell. A member can switch email on, and it then joins the one-a-day "messages are waiting" email, without any text.
   - (b) Email on at the start for mentions and announcements.
   - (c) Never any email about rooms.

Smaller points I will follow unless you say otherwise:

- **Rooms are archived, never deleted.**
- **At most five pinned messages** per room, and **ten mentions** per message.
- **The demo's rooms,** all fictional and with nothing medical in them: כללי / General; הודעות האיגוד / Announcements (only moderators write); שאלות ותשובות / Questions and answers; דיון מקצועי / Professional discussion; כנסים ואירועים / Conferences and events; מתמחים / Residents.

## 11. Checkpoint test

After M12 the owner tests the demo with two browser windows and the admin area: browse and join a room, write, react, mention; as a moderator pin, announce, lock and ban; as staff open a room and a category. The demo script gets a rooms section.

## 12. Owner answers

Given on 2026-10-05: "i approve the plan". No question was answered differently, so the recommended answer to each stands:

1. **Who can join:** any active member; their name is shown to the people in the room, and they are told before the first join. The member list is for people in the room; everyone else sees the number.
2. **Open rooms only** in M12. Rooms by invitation come in M13.
3. **Staff open rooms**, and appoint members as moderators of a room.
4. **Staff with the chat permission** can open any room, read it and act as a moderator. Private conversations stay closed to staff.
5. **Reactions:** a fixed set of six, in rooms and in private chat.
6. **Email about rooms:** off at the start. In the app: mentions, replies and announcements, under the bell.

The smaller points stand as proposed: rooms are archived, never deleted; five pins a room; ten mentions a message; the six demo rooms.
