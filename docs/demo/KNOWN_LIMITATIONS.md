# Known limitations

What IUA Connect does not do today, written for someone who was not there while it was built. Nothing here is hidden in the demo; this page is so that nothing is promised by mistake.

Last updated: 5 October 2026 (milestone M13, groups, invitations, online status and files in chat).

## 1. It is a demo

| What                                 | Today                                                                                           | Before real members use it                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Where it runs                        | On one Windows computer, started by hand                                                        | Hosting in an Israeli region, with backups and monitoring                             |
| The people and data                  | All fictional. No real member, patient or physician directory was loaded                        | A decision on how real members are brought in (the CSV import exists)                 |
| Email                                | Written as files to a folder (`outbox`), not sent                                               | A real mail provider, with the association's sending domain                           |
| Uploaded files                       | Kept on the computer's disk; not scanned for viruses                                            | Object storage and a virus scanner (the places for both exist in the code)            |
| Rate limits                          | Counted in the memory of one process; they reset when it restarts                               | A shared store                                                                        |
| Two-step verification for demo staff | One shared authenticator entry for all demo staff accounts, so a pitch isn't interrupted        | Each person sets up their own; the shared entry exists only for `@demo.test` accounts |
| Imported content                     | A small hand-picked sample from the IUA website (titles, dates, links), loaded from saved files | The owner states that permission exists; keep it in writing                           |

## 2. Not reviewed yet

- **No legal review.** There are no terms of use and no privacy notice yet, and the wording of the directory consent was written by the developer, not by a lawyer. Israeli privacy law (and the Privacy Protection Authority's rules on notifying about incidents) needs a professional reading.
- **No penetration test.** A passive scan (OWASP ZAP baseline) runs on every change; nobody has tried to break in.
- **The screen-reader check was done by one person, not by an accessibility specialist.** The project owner went through `NVDA_CHECKLIST.md` with NVDA on 3 October 2026 and noted no problems. Automated accessibility checks, keyboard checks and narrow-screen checks pass on every page. Nobody who relies on a screen reader every day has tried the site, and no outside audit was done. The accessibility statement on the site says this.
- **The ten sample exam questions were written by an AI system and checked by one urologist** (the project owner, on 2 October 2026, who found them fine). At the owner's request the demo loads them published. Before real members rely on them, the association should name who reviews medical content.
- **No load test.** It has only been used by one person at a time.

## 3. Not built

These are in the original specification and are **not** in the demo:

- **Payments** and invoices. Membership has a "payment status" field that is set by hand. The early planning documents said the database tables and a connection point for a payment provider would be prepared in advance; they were not, and neither were the planned connection points for an outside sign-in service and the Medical Association's member list. Each is work for the milestone that needs it.
- **CME tracking and certificates.** Events and education items can show CME points; nothing is counted or credited.
- **A published mobile app.** A member's app is being built (M14, M15): it runs on a phone as a demo .apk or through a developer tool (Expo Go), and is not in any app store. It has what the site shows to members and to visitors; **the admin area is on the site only.** Verifying an email address, choosing a new password from an emailed link, and passkeys also stay on the site. It was tried on one phone only: the owner went through `docs/demo/MOBILE_CHECKLIST.md` on an Android 16 phone on 2026-10-06. Nobody has tried it on an iPhone or on another Android phone, and it has no automatic tests of its screens. It exists as an .apk for the demo, which works only while the demo's computer, server and tunnel are running. There are no push notifications: the place to plug a push service in exists in the code (since M10), but nothing is plugged in and nothing is sent. A screenshot or the app switcher can show a message; the app does not try to prevent it.
- **A surgical logbook, AI features, governance and voting.** None of them appears on the member's dashboard any more. (Calculators came in M30, communities in M25, jobs and mentorship in M28, research projects and publications in M27, the journal club in M31, and case discussions in M26.)
- **Research projects and publications (M27) are a demo.** The projects and publications in the demo are made up and say so; none has a real PubMed ID or DOI. A project holds no study data and nothing about participants, and its ethics approval is shown as the lead declares it, never as checked. Projects are matched by people searching, not by the system. Filling a publication in from PubMed or ORCID sends those free public services only the identifier typed (a PubMed ID, a DOI or an ORCID iD); when either is down, typing by hand still works. A medical student can ask to join a project but not list one.
- **The journal club (M31) is a demo.** Its three entries are about made-up articles, without real PubMed IDs or DOIs, and talk about training only. A real journal club needs named editors and a schedule first. The article is linked, never copied. The poll is members' opinion, anonymous and counted only; it is not evidence or a guideline. Writing and publishing entries are on the site only; the app reads them and answers the poll. The discussion of an entry is an ordinary community post, so it is moderated like any other.
- **Case discussions (M26) are a demo, and not for real cases yet.** The demo's three cases are made up and wait for review; nothing shows until a moderator approves it. Real cases wait for the legal review (M20), because this is where a patient's details are most likely to slip in. The safeguards are a fixed form with an age range and no dates, places or institutions; the patient-details check (now with names after a title); pictures only after the author's confirmation, stripped of their hidden data; a moderator's review of every case; and a report that hides a case at once. They lower the risk and cannot remove it: a picture or a rare condition can still point to someone. Reviewing is on the site only; the app reads, writes, answers the poll and reports. Email links to the review queue open the app's home.
- **Medical imaging (M36) is for education and discussion, not diagnosis,** and says so when the viewer opens. It is a demo: real scans wait for the legal review (M20). Patient details are removed from every scan file on the server before anything is stored (only the fields the image needs are kept), but **text burned into the image itself** can't be removed that way: it rests on the uploader's confirmation, and a file that declares it is refused. There are **no demo scans yet**: public teaching scans will be proposed to the owner, each with its licence. Scans are **added on the site only**; the app shows them. The viewer needs a sign-in, also for a public library item. In Hebrew the viewer's layout stays left to right, and a few of OHIF's labels stay in English. The viewer is a large download (35 MB) on its own page.
- **Communities (M25) replaced chat rooms.** Every room is archived, and organisations have no discussion space of their own for now. The patient-details check knows a few patterns (ID numbers, phone numbers, full dates, record numbers and names after their labels, email addresses); it is a help, not a guarantee. Picking someone to mention is not offered yet.
- **Jobs and mentorship (M28) are a demo.** The positions in the demo are made up and each says so; a real launch needs real positions gathered first. Nobody applies through the platform, and the platform keeps no CVs. Mentors are matched by the person, not by the system.
- **Parts of chat.** Private chat exists since M11, rooms since M12, and groups, invitations, online status, forwarding and files in messages since M13 (see "Chat" below). Not built: voice and video calls, voice messages, any emoji as a reaction, members opening public rooms, end-to-end encryption, automatic deletion of old messages. **Chat between doctors and patients is not planned at all:** patient information is not allowed anywhere in this project.
- **A full question bank.** The exam section asks one question at a time and remembers answers; there are no timed exams, no question sets and no statistics for teachers.
- **Video hosting.** A video is a link to where it is already hosted (YouTube, Vimeo). Restricting a video to members has to be done on that host.
- **A video service.** The place to plug one in exists in the code (since M10); what is plugged in is "links", as described above.
- **Integration with the Israeli Medical Association's systems.** Members come in through applications or a CSV file.
- **Arabic and Russian.** The site is in Hebrew and English; adding a language is translation work, not a rebuild.
- **Analytics.** The admin dashboard shows numbers as they are now, with no charts or history.

## 4. Works, with rough edges

**Search**

- It finds Hebrew words with one-letter prefixes, vowel marks and final letters, and forgives a small typing mistake in a title. It does not understand Hebrew grammar beyond that (plurals, verb forms), and in English "stones" does not find "stone".
- It does not look inside attached files.

**Notifications**

- The bell's number refreshes about once a minute, not instantly.
- Email about new content is one summary a day. If the summary job is interrupted halfway, the items it had taken are not listed again.
- A member is told about new content published since their account was created, not before.

**Chat**

- **Messages are not end-to-end encrypted.** They are stored in the database like the rest of the data, and whoever can read the database can read them. Encrypting the disk and the backups is on the readiness checklist.
- **Nothing technical stops a person from typing a patient's details.** A note above the message box says not to, "details that identify a patient" is a reason for reporting, and staff can delete a reported message. This needs the legal review before any real use.
- **Staff see a reported message with the five before and after it, and nothing else.** There is no screen for reading conversations, and every look at a report is recorded. Who moderates, and how long messages are kept, are decisions for the association and the legal review; today messages are kept until a person deletes them or the account is deleted.
- **A person can write only to members listed in the member directory** (and not to those who chose "nobody"). The person written to sees the writer's first and last name, also when the writer is not listed.
- "Delivered" means the other person's app received the message. With "read" switched off on either side, neither sees it.
- A message can be edited for 15 minutes. Deleting for everyone leaves "This message was deleted" in its place.
- Email about messages is at most one a day, and never shows a message or who sent it.
- Messages arrive live through one open connection per chat page. **How many open connections one server can hold was not tested.** If the connection can't be opened, the page asks every ten seconds instead.
- **Up to three chat windows per person.** With a fourth open (tabs, or several devices), the windows take the live connection from each other in turn, and a window that is reconnecting can miss an edit or a reaction until it is refreshed. New messages are not lost.
- The number on the Chat link refreshes about once a minute on pages other than chat.
- A long conversation loads 50 messages at a time; there is no "jump to this message" from a search result.

**Chat rooms**

- **Everything said above about encryption and patient details holds for rooms, and matters more,** because many people read a room.
- **Rooms are opened by staff only,** and all of them are open to every active member. There are no rooms by invitation and no rooms a member opens.
- **Joining a room shows your first and last name to the people in it,** also if you are not listed in the member directory. The member is told before joining.
- **Staff with the chat permission can read any room.** Private conversations stay closed to them.
- **A moderator is a member the staff appointed.** Moderators delete messages, remove and ban people, lock the room, pin and announce. Each action is recorded with its reason. Who the moderators should be is a decision for the association.
- Six fixed reactions. No custom emoji picker.
- A mention works only for people in the room, chosen from the names offered while typing "@". Ten a message.
- Five pinned messages a room.
- There is no "read by" or "delivered" in a room, only the reader's own unread count.
- "Is typing" in a room names one person, or says "several people".
- Notices about rooms (a mention, a reply to you, an announcement) are under the bell. Email about rooms is off unless the member switches it on, and then it is the same one-a-day "messages are waiting" email, without text or sender.
- A room is archived, never deleted: it leaves the lists and stays readable for the people who were in it.
- A room's picture can be uploaded by staff; like every upload in the demo it is not scanned for viruses.
- **A room of 2,000 people and 10,000 messages was tested in the database, not with 2,000 open browsers.** How many open connections one server can hold is still not tested.
- The moderator search on the admin room page uses the membership list, so it needs the "read memberships" permission too. IUA admins have both.

**Files in messages (M13)**

- **Files are in the demo before the legal review.** The project's earlier decision was that files wait for it, because a picture or a document between doctors is the likeliest place for a patient's details. The owner decided on 5 October 2026 to build them now for the demo. **The review is still needed before any real member uses them.**
- **A video keeps what the phone wrote into it:** when it was filmed, and often where. A picture is re-made by the server and loses these details; the project has no tool that does the same for video. The page says so beside the attach button.
- **A video is not checked for viruses,** not even by a real scanner if one is plugged in later, because it is never read into memory. The demo has no virus scanner at all (as for every upload).
- Only JPEG and PNG pictures and PDF (10 MB each), and MP4 video (100 MB). No Word or PowerPoint files, no sound, no other video formats. Three files a message, one video at most.
- A video has no preview picture until play is pressed, and no captions. Whether a particular phone's video plays depends on the browser; the tests check that the file is delivered, not that every film plays.
- **A file can be forwarded, and then lives as long as any message carries it.** Deleting your own message doesn't take the file back from a conversation it was forwarded to.
- **Nothing stops a person from saving or forwarding what they can read.**
- A report keeps how many files a message had, not the files. Staff deciding on a report can't open them.
- An upload that is never sent is removed after a day.
- The seed has a sample picture and a sample PDF, and no sample video.

**Groups, invitations and online status (M13)**

- **The association's staff can't read a group** made by members, as they can't read a private conversation. If a group turns bad, the protections are: a report from inside it, blocking, leaving, and suspension from chat. Whether that is acceptable is a decision for the association and the legal review.
- Up to 50 people in a group. A group has one name (not one per language), no picture, no pinned messages, no announcements and no moderators: one admin, who can rename it, invite, remove a person, and hand it over.
- An invitation waits 30 days. The person who invited is not told about a decline.
- Only members listed in the directory can be found by name to invite. Staff inviting to a room by invitation use the same search.
- **Online means "has a chat page open",** not "is looking at it". The plan said the tab must also have been in front in the last five minutes; that part was not built.
- "Last active" is rounded to today, this week, or a while ago. It is shown only to people who already share a conversation or a group with the person, and each person can switch it off.
- A forwarded message doesn't say who wrote the original. A mention and a reply are not carried over.
- A page opened at a found message ("Go to this message") shows the messages around it and doesn't follow new ones until "Go to the newest messages" is pressed.
- Five pinned conversations a person, across private conversations, groups and rooms.

**Membership**

- "Expired" is worked out from the end date; nothing emails a member before their membership ends.
- A department without a director sends its applications straight to the association, flagged.

**Events**

- A reminder whose time had already passed when the person registered is skipped.
- The place, address and organiser of an event are one text, not one per language.
- Time ranges on Hebrew pages read right to left (the owner chose to keep this).

**Education**

- To change a published item it is taken down, edited and reviewed again; it is hidden in the meantime.
- Documents that editors upload are published as they are; nobody checks that a PDF is accessible.

**Administration**

- Wide tables scroll sideways inside their frame on a phone.
- A session ends after a period without activity, with no warning beforehand.
- The audit log shows its details as raw data, not as sentences.
- Roles are fixed in the code. A new role, or a change in what a role may do, is a developer's job.
- A sent message to members can't be recalled or deleted.

**Language**

- Switching language on the search page returns to an empty search.
- A piece of content written only in Hebrew is shown in Hebrew to English readers, with a note.

**On this computer**

- To start over, use `pnpm demo:reset`. The older `pnpm db:reset` was not checked in this milestone.
- The automated browser tests leave their test items in the development database. `pnpm demo:reset` clears them.

## 5. Decisions waiting for the association

1. Who hosts it, and under whose name.
2. Whether members pay through the site, and with which provider.
3. Which video provider, if videos are to be restricted to members.
4. Who the first administrators are, and who reviews medical content.
5. Whether the member directory stays opt-in (as built) or changes.
6. For chat: who moderates, how long messages are kept, what staff may read, and whether files may be sent.
7. The legal texts: terms, privacy, consent wording, and an accessibility coordinator's contact details as Israeli regulations require.
