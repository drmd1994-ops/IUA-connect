# Known limitations

What IUA Connect does not do today, written for someone who was not there while it was built. Nothing here is hidden in the demo; this page is so that nothing is promised by mistake.

Last updated: 2 October 2026 (end of the MVP, milestones M0 to M9).

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
- **No screen-reader check by a person yet.** Automated accessibility checks, keyboard checks and narrow-screen checks pass on every page. The NVDA check is prepared (`NVDA_CHECKLIST.md`). The accessibility statement on the site says this.
- **The ten sample exam questions were written by an AI system and checked by one urologist** (the project owner, on 2 October 2026, who found them fine). They are loaded unpublished and shown only after an administrator publishes them. Before real members rely on them, the association should name who reviews medical content.
- **No load test.** It has only been used by one person at a time.

## 3. Not built

These are in the original specification and are **not** in the demo:

- **Payments** and invoices. Membership has a "payment status" field that is set by hand. The early planning documents said the database tables and a connection point for a payment provider would be prepared in advance; they were not, and neither were the planned connection points for push notifications, a video provider, an outside sign-in service and the Medical Association's member list. Each is work for the milestone that needs it.
- **CME tracking and certificates.** Events and education items can show CME points; nothing is counted or credited.
- **A mobile app.** The site works in a phone's browser. There are no push notifications.
- **Community, case discussions, research collaboration, publications, jobs, mentorship, messaging between members, a surgical logbook, calculators, AI features, governance and voting.** Four of these appear on the member's dashboard as "Coming soon", and can't be clicked.
- **A full question bank.** The exam section asks one question at a time and remembers answers; there are no timed exams, no question sets and no statistics for teachers.
- **Video hosting.** A video is a link to where it is already hosted (YouTube, Vimeo). Restricting a video to members has to be done on that host.
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
6. The legal texts: terms, privacy, consent wording, and an accessibility coordinator's contact details as Israeli regulations require.
