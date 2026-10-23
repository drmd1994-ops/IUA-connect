# M25: Professional communities

**Status: approved by the owner on 2026-10-23 with the answers in §10. Proposed on 2026-10-07; checked against the code and rewritten on 2026-10-23 (§0b). Nothing of it is built.**

Track: Phase 2. Size: L. Needs first: nothing technical; the owner's answers in §9.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). Communities are a platform feature for verified people. Communities of an organisation, for its own members, are left for later (§2, "Not in").

## 0b. What I checked on 2026-10-23

**What exists that this builds on:**

- **Chat rooms** (M12, M13): staff open rooms; members join; messages with names, replies, the six reactions, @mentions, pinned messages, announcements; moderators appointed per room who delete, lock, remove and ban with a reason in the audit log; reports with reasons, and a staff queue. Files in messages: pictures and PDF (10 MB), video (100 MB). Rooms are a stream: what was said last week scrolls away.
- **Verification** (M17): the platform knows a person as a specialist, resident, physician or medical student; residents and students carry a mark beside their name.
- **The 11 subspecialties**, used everywhere.
- **Search** (M7) covers news, events, education, guidelines and members, with Hebrew-aware matching.
- **Notices** (M7) with a switch per kind.
- **The member's home page** shows "Ask the community" as "Coming soon".
- **The app** has every member screen; the admin area stays on the site.

**What is missing:** everything in §2. And one thing the old plan took for granted does not exist: **there is no check for patient details anywhere.** Chat shows a standing note ("don't send pictures, documents or videos of patients") and has "details that identify a patient" as a report reason, nothing more. This plan builds the first check (§3), which case discussions (M26) will reuse.

## 1. Goal

Physicians post and discuss by subspecialty: a question or a topic with its comments, which stays findable, unlike a chat room's stream.

**Why:** specification §17. Rooms give live conversation; a community gives lasting, threaded, searchable discussion.

## 2. Scope

**In**

- **Eleven communities, one for each subspecialty,** opened by the platform's staff, who can also open more (for example "Residents' corner").
- **A post:** a title, text, and pictures or PDF files as in chat (no video), with a kind: a question or a discussion. The writer can edit it for 24 hours and delete it.
- **Comments,** one level of replies under a comment; editable for 15 minutes, as in chat.
- **The six reactions** of chat, on posts and comments.
- **"Answered":** the writer of a question marks one comment as the answer.
- **Following** a community (its new posts) or a post (its new comments); the writer follows their own post.
- **Bookmarks,** the reader's own.
- **The feed:** new posts in the communities the reader follows, newest first, and each community's own list, by newest or by latest activity.
- **Search** covers posts and comments.
- **Notices:** a comment on your post or under your comment, a mention, a new post in a community you follow; one new kind, "Communities", with its switch.
- **Moderation**, as in rooms: moderators appointed per community; they remove a post or a comment with a reason (a marker stays), lock a post, and ban a person from a community; reports go to the staff queue chat already has.
- **On the site and in the app.** Opening communities and appointing moderators stays on the site.
- **Demo data:** fictional posts and comments in a few communities (§9).

**Chat rooms close (§10, answers 1 and 6):**

- Every chat room is archived when this milestone goes live: open rooms, rooms by invitation, announcement rooms and organisations' rooms. Nothing is deleted; staff can still open an archived room and read it.
- Members no longer see rooms: Chat keeps private conversations and groups (with their invitations). Staff can no longer open new rooms.
- The rooms' code stays, unused, so the decision can be undone. Their notice kind ("Chat rooms") leaves the settings.
- What rooms gave elsewhere: a committee meets in a group (by invitation, M13); an organisation tells its members through its messages (M7). An organisation has no community of its own yet ("Not in" below).

**Not in**

- Case discussions (M26), with their fixed form and review before publishing.
- Anonymous posting.
- Members opening their own communities.
- Communities of an organisation for its members.
- Video in posts.

## 3. Rules

- **Who takes part:** see §9, question 3. Everyone writes under their own name, with the student or resident mark.
- **The patient-details warning:** before a post or a comment is sent, its text is checked on the server for what looks like a patient's details: an Israeli ID number (9 digits with a valid check digit), a phone number, a full date, a hospital record number pattern, and words like "patient name" / "שם המטופל" followed by a name. When something is found, the writer sees what and why, and must change it before it is sent (§10, answer 4). The standing note about patients is shown above every box where one writes. This is a help, not a guarantee, and the page says so.
- **Staff can read every community;** each community's page says so, as rooms do.
- **A removed post or comment leaves a marker** ("removed by a moderator"); the audit log has who removed it and why.
- **A banned person** reads the community but can't write in it.
- **Blocking** (M11): the writer's posts stay visible to the person who blocked them (a community is public among its members), but neither gets notices about the other.

## 4. What is built

**Data:** `communities`, `community_moderators`, `community_bans`, `community_follows`, `posts`, `post_files`, `post_comments`, `post_reactions`, `comment_reactions`, `post_bookmarks`, `post_follows`; a `COMMUNITIES` notice kind. Reports extend chat's reports table with a post or a comment.

**Server:** a `community` module, reusing chat's files, reactions list, report reasons and moderation pattern; a `patient-details` check in shared code; search extended to posts.

**Site:** Communities in the main menu (the feed, a community, a post, writing); Administration → Communities (open, moderators); the existing report queue gains posts and comments.

**App:** the feed, a community, a post, writing and moderating.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Who may read and write; bans; a moderator only in their own community.
- Removing a post keeps its marker, hides its comments' text from readers, and is in the audit log.
- Notices only to followers and to the people concerned, with the switch; never to someone blocked.
- The patient-details check: each pattern found, and ordinary medical text (doses, ages, years) not flagged.
- Search finds posts and comments, in Hebrew and English.
- Browser tests of writing, commenting, marking an answer and moderating, in both languages, with accessibility checks; app tests of the same screens.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Data, communities and moderators
3. Posts, comments, the patient-details check
4. Reactions, answers, bookmarks, follows, the feed
5. Reports and moderation
6. Notices and search
7. The app
8. Demo data, documents, status, deploy, the demo

## 8. Risks

| Risk                                               | What is done about it                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Members miss the rooms                             | Rooms are archived, not deleted; the decision can be undone                                                            |
| A patient's details are posted                     | The warning (§3), the standing note, reports with that reason, removal by moderators; the legal review before real use |
| The warning flags ordinary medical text and annoys | Narrow patterns, tested against ordinary text; the writer is told exactly what was found                               |
| Moderation load                                    | The same tools and queue as rooms; no new place for staff to watch                                                     |
| Empty communities look dead                        | Demo posts for the pitch; for real use, a few colleagues asked to start each community                                 |

## 9. Questions for the owner

My recommendation for each is the first answer.

1. **Communities and chat rooms:** beside each other, linked (rooms for live talk, communities for lasting posts). Or: instead of rooms; or rooms extended with threads.
2. **Who moderates:** staff appoint moderators for each community, as for rooms; staff with chat moderation can act everywhere. Or: staff only.
3. **Who takes part:** every verified person (specialists, physicians, residents and medical students), with the student or resident mark. Or: residents and up, students read only; or specialists only.
4. **The patient-details warning:** warn, and let the writer confirm that it identifies nobody. Or: block until the text is changed.
5. **Demo data:** about 10 fictional posts with comments in 4 communities, written by the demo people, plus one post removed by a moderator to show the marker. Keep or change?

## 10. Owner answers

Given on 2026-10-23, when the owner said "start M25" and answered the questions:

1. **Communities instead of chat rooms** (not my recommendation, which was beside them).
2. **Moderators** appointed by staff for each community; staff with chat moderation act everywhere.
3. **Every verified person** takes part, with the student or resident mark.
4. **The patient-details check blocks** the post or comment until the text is changed (not my recommendation, which was a warning the writer could confirm). The writer is told what was found and why.
5. **Demo data** as written: about 10 posts with comments in 4 communities, and one removed post.
6. **All rooms go**, including rooms by invitation, announcement rooms and organisations' rooms; they are **archived and kept for staff**, not deleted.
