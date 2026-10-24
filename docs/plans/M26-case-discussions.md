# M26: Case discussions and the case of the week

**Status: rewritten against the code on 2026-10-24 and approved by the owner the same day ("start m 26", with the answers in §10). Nothing of it is built yet.**

Track: Phase 2. Size: L. **A demo feature:** real cases wait for the legal review (M20), because this is where patient information is most likely to slip in. The plan is built around preventing that.

## 1. Where the code stands

- **Pictures** (M3, M13): every uploaded JPEG or PNG is decoded and re-encoded, which drops its hidden data (camera, location, dates, comments). The type comes from the file's content, not its name. **Scan files (DICOM) are already refused:** only JPEG, PNG, PDF, Word and PowerPoint are accepted. Each file has a read rule: chat and community files are readable only by those who can read their message or post.
- **The patient-details check** (M25, shared by the site, the app and the server) finds Israeli ID numbers, phone numbers, full dates, record numbers, a patient's name after its label, and email addresses. **It does not yet catch a name after a title** ("Mr", "Mrs", "מר", "גב׳"), which this plan adds.
- **Communities** (M25): one for each subspecialty, with moderators appointed per community, posts, comments with replies, reactions, reports into the staff queue, following and notices.
- **The journal club** (M31) opens its discussion as a community post, and has an anonymous poll with totals only. Both can be reused here.
- **Review before publishing** exists for news, education, positions and the journal club.
- **Platform or organisation (M16):** a platform feature. The moderators who review cases are the communities' moderators (§9 question 2).

## 2. Goal

A member presents a made-up or (later, after the legal review) de-identified case in a fixed form; a moderator reviews it before anyone else sees it; colleagues discuss it; moderators choose a case of the week.

**Why:** Specification §16.

## 3. Scope

**In**

- **A case in a fixed form:** title; subspecialty; age range (never an exact age: under 18, 18 to 39, 40 to 64, 65 to 79, 80 or over); sex; presenting problem and history; examination; laboratory results; imaging; pathology; what was done (optional); and the question to colleagues. No field asks for a date, a place or an institution.
- **The patient-details check** on every field, before sending and on the server, now with names after a title. What it finds blocks sending, as in communities.
- **Pictures** (§9 question 1): JPEG or PNG only, up to 4, re-encoded on upload. Before adding one, the author confirms it shows no name, number, date or face. Pictures are readable only by those who can read the case.
- **Review before anyone sees it:** a moderator of the case's subspecialty (or a platform moderator) approves it, or returns it to its author with the reason. The author never approves their own. The queue shows how long each case has waited.
- **Discussion** (§9 question 4): opening a case after approval starts its discussion as a post in the subspecialty's community, as in the journal club; comments, replies, reactions, reports and moderation come with it.
- **A report on the case itself hides it at once,** until a moderator looks at it again.
- **The poll** "What would you do?": the author writes 2 to 4 options; anonymous, totals after answering, as in the journal club. Optional.
- **Case of the week:** a moderator marks one approved case; it shows on the member's home on the site and in the app.
- **The author** (§9 question 3).
- **The standing note** on every case: "For education. Not advice about a patient."
- **On the site and in the app.** Reviewing and choosing the case of the week on the site only, like the admin area.
- **Demo data** (§9 question 5).

**Not in**

- Any identifiable patient information, in any field or picture.
- Cases visible to anyone who is not verified.
- Consultation about a patient being treated now ("what should I do today").
- Scan files (DICOM), video, documents attached to a case.
- Real cases on the hosted demo, until the legal review.

## 4. Rules

- Nothing is shown before a moderator approves it. A returned case goes back to its author with the reason; they may change it and send it again.
- The author changes a case only while it is a draft or returned; an approved case is taken back by a moderator to change it, and reviewed again.
- An age is a range; a date is never asked for; an institution is never shown on a case.
- A report hides a case at once, pending review; a moderator restores or removes it.
- Deleting a case deletes its pictures. An author's account removed: the case stays, without the name.
- Every review step is in the case's history and the audit log.

## 5. What is built

**Data:**

- `cases`: the fixed fields, the author, the subspecialty, the state (`DRAFT`, `IN_REVIEW`, `RETURNED`, `PUBLISHED`, `HIDDEN`, `REMOVED`), who reviewed it and why, its discussion post, and whether it is the case of the week.
- `case_files` (pictures, with a new file purpose `CASE` and its own read rule), `case_poll_options`, `case_votes` (one per person, totals only), `case_history`, and `case_reports`: reports on a case go to the cases review queue (owner answer §10.6).
- `notification_kind` gains `CASES`: your case was approved or returned, and (for moderators) a case waits for review.

**Server:** a `cases` module; the review queue; the case of the week; the read rule for pictures; the patient-details check extended with titles.

**Site:** Cases in the main menu (the case of the week, approved cases by subspecialty), writing and sending a case, my cases, a case with its poll and the way to its discussion; Administration → Cases for review; the case of the week on the member's home.

**App:** the list, a case with its poll and discussion, my cases, and writing a case (text; pictures from the phone's photo library, with the same confirmation).

## 6. New libraries, services and costs (each needs the owner's approval)

- **None.** Pictures use the image library already in use (`sharp`).

## 7. Tests

- An unapproved case is invisible to everyone but its author and moderators; its pictures too.
- The check finds names after a title, in Hebrew and English, and ordinary text passes.
- Pictures lose their hidden data; a DICOM file is refused.
- The author can't approve their own; a returned case comes back with the reason.
- A report hides a case at once.
- The poll never reveals who voted what.
- Browser tests in both languages with accessibility checks; app tests of the new screens.

## 8. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. The form, the check with titles, and the review queue, with tests
3. Pictures and their read rule
4. Discussion, reports and hiding
5. The poll and the case of the week
6. Site
7. App
8. Demo data, documents, status, demo script

## 9. Questions for the owner

1. **Pictures:** allowed with the confirmation and review, or text only at first? Recommended: allowed, as planned; the demo has none, and the lawyer decides for real use.
2. **Who reviews cases?** Recommended: the moderators of the case's community (already appointed per subspecialty in M25), and the platform's chat moderators.
3. **The author's name:** shown to readers, or hidden from readers (known to moderators)? Recommended: shown, as in communities.
4. **Where is the discussion?** Recommended: a post in the subspecialty's community, opened on approval, as in the journal club.
5. **Demo data:** Recommended: 3 made-up cases written by me, text only, seeded as **waiting for review**, so nothing shows until the owner approves each one in the review queue (they are medical content). The owner may then make one of them the case of the week.

## 10. Owner answers (2026-10-24)

1. **Pictures are allowed,** with the author's confirmation and a moderator's review. The demo has none; the lawyer decides for real use.
2. **The community moderators review cases,** with the platform's chat moderators.
3. **The author's name is shown** to readers.
4. **The discussion is a post in the subspecialty's community,** opened on approval.
5. **Demo data: 3 made-up cases, text only, waiting for the owner's review;** nothing shows until approved.
6. **Reports on a case go to the cases review queue** (asked 2026-10-24 while building), for the same community moderators who review cases, instead of chat's reports queue.

## 11. Risks

| Risk                                                                                                  | What is done about it                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A picture identifies a patient despite everything (a tattoo, a rare finding, text burned into a scan) | The author's confirmation, a human review of every case, said as a residual risk; the lawyer decides on real use |
| A rare condition identifies a patient by itself                                                       | The age range and no dates or places; the moderator's review; the standing note                                  |
| Moderators are slow and cases wait                                                                    | The queue shows waiting time; several moderators per community                                                   |
| A case is taken as advice about a patient                                                             | The standing note on every case                                                                                  |
