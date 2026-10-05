# M13 — Chat, part 3 (groups, rooms by invitation, online status, files): plan

- Status: **Approved by the owner on 2026-10-05,** with the answers in §11 and §12. Where §2 to §9 differ from those answers (files and video are built, groups hold 50 people, forwarding carries files), §11 and §12 decide.
- Date: 2026-10-05
- Asked for by the owner: "continue to M13" (2026-10-05). The request itself is `chat.md.txt`: what M11 and M12 left out of §2 (online and last active, files, pinned conversation), §1 (group chats), §3 (public/private visibility of a room), §10 (search by sender and date), §16 (forward), §18 (files and media) and §19 (who can add me, online status).
- Builds on: `docs/plans/M11-chat.md` (private chat, merged), `docs/plans/M12-chat-rooms.md` (rooms, pull request #17, **not merged yet**), [ADR 0009](../adr/0009-live-updates-by-event-stream.md).
- Design sources: `SECURITY_MODEL.md` ("Chat", "Chat rooms", "Files"), `DATABASE_DESIGN.md` §8, owner decisions D9 (opt-in directory), D15 (PostgreSQL only, local disk, no virus scanner in the demo) and O6 (legal review before any real data).

**M13 is built on top of M12.** Pull request #17 should be merged before M13's code starts, so that M13 has its own pull request into `main`.

## 1. Goal and exit criteria

The last third of the owner's chat request. Members can talk in a small group they make themselves; staff can open a room that is joined by invitation only; a member can see whether a colleague is around, if that colleague allows it; and a few things that make chat easier to use every day. Files in messages are in the plan as a question (question 1), because the project's standing decision is that they wait for the legal review.

**Exit criteria**

- **Nobody outside a group reads it,** whatever id is put in a request, and staff have no way in except a report. Tested for every group route.
- **Nobody is put into a group or a by-invitation room without agreeing.** An invitation does nothing until the invited person accepts it. Tested.
- **A room by invitation is invisible** to a member who was not invited: not in the list, not in search, and "not found" at its address. Tested for every room route.
- **Online status is never shown against a person's choice.** With the switch off, no route and no live event says anything about them. Tested.
- If files are built (question 1): **a file in a message is readable only by the people who can read that message,** and stops being readable when the message is deleted or the person leaves. Tested for every way to reach a file.
- Private chat and rooms keep working: the M11 and M12 suites pass.
- No WCAG 2.2 AA violations (axe) on the new pages and dialogs in Hebrew and English.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M13**

1. **Group chats**
   - A member starts a group from the Private side of Chat: a name, and the people to invite. Up to 20 people (question 3).
   - Only people the member could write to privately can be invited (listed in the directory, not blocking, not "nobody"), and only if their own setting allows invitations (item 4).
   - **An invitation must be accepted.** Until then the invited person sees the group's name, who invited them and who is in it, and nothing that was written. They can decline, and can block the inviter.
   - In a group: everything a room message has (replies, reactions, mentions, edit, delete, "delete for me", copy, report). No "delivered" or "read" marks; unread counts as in rooms.
   - The person who made the group is its **admin**: rename it, invite, remove a person, pass the role on. Everyone can leave. When the admin leaves, the longest-standing member becomes admin. A group with nobody in it is closed.
   - Groups appear in the Private list, with a group picture mark and the number of people.
   - **Staff can't read groups** (question 6). A message or a person in a group can be reported, exactly as in a private conversation: staff see the reported message and the five around it.
2. **Rooms by invitation**
   - Staff can open a room as **by invitation**. It is not in "Browse rooms" and not found by search.
   - Its moderators, and staff, invite active members by name. The invited member accepts or declines, and is told that the room will see their name.
   - Everything else is a room as in M12.
3. **Online and "last active"** (question 2)
   - A green dot beside a person who has a chat page open now, and "active today / this week / a while ago" otherwise. Never an exact time.
   - Shown only to people who already have a private conversation or a group with that person. Never in rooms, never in the directory.
   - One switch in chat settings, "Show when I am active". Someone who switches it off doesn't see others' either.
   - Nothing is stored for "online": it comes from the open connection. "Last active" is one date per person, updated at most once every ten minutes.
4. **A new privacy setting: "Who can invite me to groups and rooms"**: members I could be written to by (the starting value), only people I already have a conversation with, or nobody.
5. **Forwarding** (question 5): "Forward" in a message's menu sends a copy of its text to another conversation, group or room the member is in, marked "Forwarded". It doesn't say who wrote it or where it came from.
6. **Smaller things left open by M11 and M12**
   - **Pin a conversation** to the top of your own list (up to five).
   - **"Go to this message"** from a search result: the conversation opens at that message, and earlier and later ones load around it.
   - **Search by sender and by date** in the message search.
7. **Files and images in messages: only if question 1 is answered (b).** Then:
   - Up to three files a message: JPEG and PNG pictures (re-encoded, all metadata removed, as every upload already is) and PDF. 10 MB each. A message may be files without text.
   - Pictures show small in the message and open large; a PDF shows as its name and size, and downloads.
   - A file is reached only through a short-lived signed link, given after checking that the person can read the message.
   - Deleting a message for everyone deletes its files.
   - The upload uses the existing files module and its limits; the virus scanner is still the "no-op" one of the demo, and the app already refuses to start in production with it.
   - A second standing note beside the attach button: "Do not send pictures or documents of patients."
   - **Not forwarded,** and not kept in a report's copy (a report shows that a message had files, not the files).
8. **Notifications:** an invitation to a group or a room is a notice under the bell, under the existing kinds (groups under "Private messages", rooms under "Chat rooms"). A group counts as private chat for the Chat number and for the one-a-day email.
9. **Demo seed:** one group of the three demo members with a few messages, one invitation waiting for the demo member, one room by invitation, and (if files are built) one drawn sample picture and one sample PDF, both saying they are fictional. Nothing medical.

**Not in M13, and where it goes**

| Item                                                             | Where                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| Files in messages, if question 1 is answered (a)                 | Its own milestone, after the legal review (O6)        |
| Word, PowerPoint and other document types; video and sound files | Not planned; each widens what can leak                |
| Voice and video calls, voice messages                            | Not planned                                           |
| Any emoji as a reaction, an emoji picker                         | Not planned; it needs a library                       |
| Members opening public rooms                                     | Not planned (M12 decision)                            |
| Doctor/patient and clinic chats                                  | **Not planned.** Patient information is not allowed   |
| End-to-end encryption                                            | Not planned for the demo; a question for the review   |
| Automatic deletion of old messages                               | After the legal review sets the period                |
| A test of how many open connections one server holds             | The readiness checklist; it needs a load-testing tool |
| Real push notifications                                          | With the mobile app                                   |

## 3. Rules (proposed; approved with the plan unless a question in §10 changes them)

- **Who may make a group:** an active member with a first and last name, as for starting a private conversation.
- **A group is private like a one-to-one conversation.** Only its people read it. Anyone else gets "not found", like for an invented id. Staff see a report and nothing else.
- **An invitation** shows the invited person: the group or room, who invited them, and (for a group) who is in it. It can be accepted, declined, or left unanswered; it ends after 30 days. The inviter is not told about a decline.
- **Limits:** 20 people in a group; a member can make 5 groups a day and send 30 invitations a day; 5 pinned conversations.
- **Blocking:** a person can't invite someone who blocked them, or whom they blocked. Two people with a block between them can be in the same group (someone else brought them together); each sees the other's messages folded, as in rooms.
- **Leaving a group** keeps what you wrote. A removed person can be invited again.
- **A member whose membership ends** keeps reading their groups and can't write, as everywhere in chat.
- **Suspension from chat** (M11) also stops writing in groups, making groups and inviting.
- **Online** means "has a chat page open and the browser tab was in front in the last five minutes". It is shown as a dot with a text for screen readers, never by colour alone.
- **"Last active"** is rounded to "today", "this week" or "a while ago".
- **Forwarding** needs the right to read the message and to write where it goes. A deleted message can't be forwarded. Mentions are not carried over.
- **A by-invitation room** can be changed to open by staff, and an open one to by-invitation; people already in it stay.

## 4. Database (additions only)

- **`conversations`** gains the kind `GROUP` (in a migration of its own, as enum values need), and `invite_only` for rooms. A group uses the room columns it needs: the name (one field, not two languages), `created_by`, `member_count`. The check constraints are widened accordingly.
- **`conversation_members`** gains the role `ADMIN` (for a group) and `pinned_at`.
- **`conversation_invitations`**: conversation, invited person, invited by, when, and how it ended (accepted, declined, withdrawn, expired). One open invitation per person per conversation.
- **`chat_preferences`** gains `invites_from` (the new setting), `show_activity` (the switch) and `last_active_at`.
- **`messages`** gains `forwarded` (yes or no).
- If files are built: **`message_attachments`** (message, file, order), and the `files` table's purpose list gains `CHAT`. The file access check learns one more rule: a chat file is readable by whoever can read its message.
- Indexes: invitations by invited person and state; members by person and `pinned_at`.

## 5. API (under `/api/v1`, every route declared)

- **Groups:** `POST /chat/groups` (name, people), `GET /chat/groups/{id}`, `PATCH /chat/groups/{id}` (rename; admin), `POST /chat/groups/{id}/invitations`, `POST /chat/groups/{id}/members/{userId}/remove`, `POST /chat/groups/{id}/admin` (pass the role on), `POST /chat/groups/{id}/leave`, `GET /chat/groups/{id}/members`, and messages, read and typing as for rooms. Groups come back in `GET /chat/conversations` with their kind.
- **Invitations:** `GET /chat/invitations` (mine, open), `POST /chat/invitations/{id}/accept`, `/decline`; `POST /chat/rooms/{id}/invitations` (moderators and staff), `DELETE /chat/invitations/{id}` (withdraw; the inviter, a group's admin, a room's moderator).
- **Activity:** `GET /chat/activity?userIds=` (only for people the caller shares a private conversation or a group with; others are left out of the answer without a word). Live: an event when one of those people comes online or goes.
- **Settings:** `/me/chat-settings` gains the two fields.
- **Forward:** `POST /chat/messages/{id}/forward` (to a conversation, group or room).
- **Pin a conversation:** `PATCH /chat/conversations/{id}/me` and the group and room equivalents gain `pinned`.
- **Search:** `GET /chat/search` gains `senderId`, `from`, `to`. Messages gain `around` (a message number) beside `before` and `after`.
- **Admin:** the room editor gains "by invitation".
- If files are built: `POST /chat/attachments` (upload; the caller only), sending a message accepts up to three attachment ids the caller uploaded and has not used, and `GET /chat/messages/{id}/attachments/{fileId}/url` gives the signed link after the check.

## 6. Tests

- **Unit:** who may invite whom (the setting, blocks, listing, membership); what "last active" rounds to; who becomes admin when the admin leaves; the limits.
- **Integration**
  - **Reading a group (exit criterion):** someone outside, an invited person who has not accepted, a removed person and staff each get nothing from every group route, with the same answer as for an invented id.
  - **Invitations (exit criterion):** nothing of the group or room is readable before accepting; accept, decline, withdraw and expiry; the setting "nobody" and a block make the person impossible to invite, with the same answer as someone who doesn't exist; twenty people accepting at once never pass the limit of 20.
  - **Rooms by invitation (exit criterion):** not in the list, not in search, "not found" on every room route for a member who was not invited; only moderators and staff invite.
  - **Activity (exit criterion):** with the switch off, no route and no event mentions the person; a stranger gets nothing about anyone; "online" ends when the last page closes.
  - **Groups:** admin actions refused to others; the role passes on; an empty group closes; reports from a group keep the message and five around it.
  - **Forwarding:** refused for a message the caller can't read and to a place the caller can't write; mentions and reply links are not carried over.
  - **Pins, search filters, "around":** five pins at most; sender and date limits; a page around a message in a 10,000-message conversation uses the index.
  - **Files, if built (exit criterion):** only the allowed types and sizes; a file can't be attached twice or by someone else; the link is refused to anyone who can't read the message, after the message is deleted, and after the person left; metadata is gone from an uploaded picture.
  - **Unchanged:** the M11 and M12 suites pass.
- **End to end (Playwright):** a member makes a group and invites two; one accepts and sees messages arrive live, one declines; the admin removes a person and passes the role on. Staff open a room by invitation; a moderator invites a member, who accepts; another member can't find it. Two members see each other's dot come and go, and it disappears with the switch off. Forward, pin a conversation, go to a found message. If files are built: send a picture and a PDF, open them, delete the message. The phone layout at 320 px; axe on every new page and dialog in he and en.

## 7. Order of work (a commit at each checkpoint; tests green at each)

1. This plan, approved.
2. Schema and migrations; groups: make, read, write, leave, admin; the reading tests.
3. Invitations: groups, the setting, accept and decline; rooms by invitation.
4. Activity: online, last active, the switch, live events.
5. Forwarding; pinned conversations; search by sender and date; a page around a message.
6. (Only with question 1 (b)) Files: upload, attach, signed links, deletion.
7. Web: groups and invitations.
8. Web: activity, forwarding, pins, "go to this message"; the admin room editor; (files).
9. Demo seed; end-to-end tests and accessibility; documents; `PROJECT_STATUS.md`; demo.

**What existing code is touched:** the chat module and screens from M11 and M12 (extended); chat settings; the room editor in the admin area; the files access check (only with files); the seed.

Git: after pull request #17 is merged, branch `feat/chat-groups` from `main`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

No new libraries are planned.

## 8. Risks

| Risk                                                          | What is done about it                                                                                                                              |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Files are where patient pictures and documents travel**     | Question 1. The recommended answer is not to build them before the legal review                                                                    |
| A group that nobody from the association can see turns bad    | Reports from inside the group; blocking; leaving; suspension from all chat. No staff reading: that is the price of privacy, and it is said plainly |
| Being pulled into groups by strangers                         | An invitation does nothing until accepted; the setting; only listed members can invite; daily limits; block from the invitation                    |
| Online status tells colleagues when a doctor is at the screen | Shown only to people already in conversation; rounded; one switch; off means off in both directions                                                |
| A room by invitation leaks that it exists                     | "Not found" everywhere for people not invited; tested per route                                                                                    |
| Forwarding spreads a private message                          | It can't be prevented (copy does the same); the copy doesn't name the writer; said in the known limitations                                        |
| Earlier chat breaks while it is extended                      | The M11 and M12 suites must pass                                                                                                                   |
| The milestone is large                                        | Nine checkpoints, each green; files are separable; question 4 offers a smaller first part                                                          |

## 9. Questions for the owner

Each has a recommended answer. Answers are recorded in §11.

1. **Files and images in messages**
   - **(a) Recommended:** not in M13. The project's decision so far is that files wait for the legal review, because a picture or a PDF between doctors is the likeliest place for patient details. They become their own milestone after the review.
   - (b) Build them now, for the demo: pictures and PDF only, three a message, 10 MB each, with the note not to send anything of a patient. The demo has no virus scanner, and the app refuses to start in production without one.
2. **Online and "last active"**
   - **(a) Recommended:** on at the start, shown only to people you already have a conversation or a group with, rounded ("today", "this week"), with one switch to turn it off.
   - (b) Off at the start; each member switches it on.
   - (c) Not at all.
3. **Who makes groups, and how large**
   - **(a) Recommended:** any active member, up to 20 people, and every invitation must be accepted.
   - (b) Up to 50 people.
   - (c) No groups made by members; only rooms by invitation that staff open.
4. **All of it in one milestone, or two?**
   - **(a) Recommended:** one milestone, without files (about the size of M12).
   - (b) Two: first groups, invitations and rooms by invitation; then activity, forwarding and the smaller things.
5. **Forwarding**
   - **(a) Recommended:** text only, marked "Forwarded", without the writer's name.
   - (b) With the writer's name.
   - (c) No forwarding.
6. **Staff and groups**
   - **(a) Recommended:** as for private conversations. Staff see only a report: the reported message and the five around it.
   - (b) Staff with the chat permission can read any group, as they can a room.

Smaller points I will follow unless you say otherwise:

- **A group has one name,** not one per language.
- **Five pinned conversations** per person.
- **An invitation ends after 30 days.**
- **Rooms by invitation are opened by staff only,** like every room.

## 10. Checkpoint test

After M13 the owner tests the demo with two or three browser windows: make a group, invite, accept and decline; see the dot come and go and switch it off; forward a message; pin a conversation; find a message and go to it; as staff open a room by invitation and invite a member. The demo script gets a section for it.

## 11. Owner answers

Given on 2026-10-05: "answers for M13 plan 1. b and also video 2.a 3.b 4.a 5.a and also add photos and videos 6.a".

1. **Files: built now (b), and video too.** Pictures, PDF and video in messages. This changes the earlier decision that files wait for the legal review; the review is still needed before real use, and the known limitations will say so.
2. **Online and "last active": (a).** On at the start, shown only to people you already have a conversation or a group with, rounded, with one switch.
3. **Groups: (b).** Any active member, **up to 50 people**, every invitation must be accepted.
4. **One milestone (a).** With the owner's answer to question 1 it includes files.
5. **Forwarding: (a), and photos and videos are forwarded too.** Marked "Forwarded", without the writer's name. A forwarded picture or video is the same stored file, readable by the people of the conversation it was forwarded to.
6. **Staff and groups: (a).** Staff see only a report.

**Still open (asked on 2026-10-05, because the plan did not cover video):** see §12. The plan is approved when these are answered.

## 12. Video: what the owner's answer leaves to decide

The plan was written for pictures and PDF. Video is different in three ways, and each needs a decision:

1. **Size.** Uploads are held in the server's memory while they are checked, and the largest file the app accepts today is 25 MB. About 15 seconds of phone video in full quality, or a minute or two in a messaging-app quality.
   - **(a) Recommended:** MP4 only, up to 25 MB, one video a message.
   - (b) Up to 100 MB. The upload then has to be written to disk as it arrives, which is new code in the files module.
2. **What is inside a video.** A picture is re-made by the server, so the place and time it was taken are removed. The project has no tool that can do this for video. A phone video usually carries when, and often where, it was filmed.
   - **(a) Recommended:** accept the video as it is, and say so plainly beside the attach button ("a video keeps the details your phone wrote into it") and in the known limitations.
   - (b) Add the tool `ffmpeg` to the server to strip these details and to make a preview picture. It is a new program to install (on this computer, in CI and on any future server), so it needs your approval as a new dependency.
3. **Playing.** The browser's own player, with its controls, inside the message. No preview picture until play is pressed (with (2a)); no captions.

**Owner's answers, 2026-10-05 ("1.b 2.a 3.ok"):**

1. **(b) Video up to 100 MB,** MP4 only, one a message. The upload is written to disk as it arrives; this is new code in the files module, and no new library.
2. **(a) A video is accepted as it is.** The details the phone wrote into it are not removed. Said beside the attach button and in the known limitations. No `ffmpeg`.
3. **The browser's own player,** no preview picture.

With these the plan is approved.

Other points, followed as proposed:

- **A report keeps no copy of pictures or videos,** only that the message had them.
- **A forwarded PDF** is forwarded too, like pictures and videos.
- **Up to three files a message,** of which at most one video.
