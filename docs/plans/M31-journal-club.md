# M31: Journal club

**Status: rewritten against the code on 2026-10-24 and approved by the owner the same day ("start M31", with the answers in §10). Nothing of it is built yet.**

Track: Phase 3. Size: S to M. Needs first: M27 (PubMed lookup) and M25 (communities' discussion), both built.

## 1. Where the code stands

- **M27** fills an article's title, authors, journal and year from PubMed by a PubMed ID or a DOI (`PubMedSource`). It sends PubMed only the identifier.
- **M25** has communities, one for each subspecialty, with posts, comments with one level of replies, reactions, moderators, reports into the staff queue, following, notices, and the patient-details check.
- **Review before publishing** exists for news, education and positions: a writer submits, someone else publishes, and the writer can't publish their own (M3, M6, M28).
- **Roles:** `CONTENT_EDITOR` (news and education) and `SUBSPECIALTY_ADMIN` exist. There is no journal club role.
- **Polls:** none anywhere. This milestone adds the first one.
- **Platform or organisation (M16):** a platform feature, like communities. An organisation's own journal club is not in this milestone.

## 2. Goal

Each month (or as often as the editors choose) an article is presented with a short summary and an expert's commentary. Members discuss it and answer one question: "Would this change your practice?"

**Why:** Specification §20.

## 3. Scope

**In**

- **An entry:** the article (filled from PubMed by PubMed ID or DOI, or typed in), a link to the publisher (through the DOI) and to PubMed, a subspecialty, a summary in Hebrew or English with its author's name, an expert commentary with its author's name, key points, and the month it belongs to.
- **Writing and review:** an editor writes it and submits it; another editor publishes it (§9 question 1). The writer can't publish their own.
- **Discussion:** opening an entry starts a discussion post in its subspecialty's community, so comments, replies, reactions, moderation, reports and following work as they do in communities (§9 question 3).
- **The poll:** "Would this change your practice?": yes, perhaps, no. One answer per person, changeable. It is anonymous: only the totals are shown, and only after answering or after the entry closes.
- **The archive:** all entries, newest first, filtered by subspecialty and year; the current one first.
- **Notices:** a new kind, "Journal club", with its switch: a new entry is published (in the app, and by email if switched on).
- **On the site and in the app.** Writing and review only on the site, like the admin area.
- **Demo data** (§9 question 4).

**Not in**

- Hosting the article's text, its figures or its abstract (copyright): a link only.
- AI-written summaries, until M33. When they come, they are marked and cite the article.
- An organisation's own journal club; live meetings (an event can be linked by hand).
- CME points for taking part (M22).

## 4. Rules

- **The article is linked, never copied.** The summary is the writer's own words.
- **Every summary and commentary names its author** and is reviewed before it shows.
- **The patient-details check** runs on the summary, the commentary and the discussion, as in communities.
- **The poll is anonymous:** the server keeps who answered (to allow one answer each, and changing it), but nobody, staff included, sees who answered what. Results are counts only.
- **Who sees it:** §9 question 2.

## 5. What is built

**Data:**

- `journal_club_entries`: the article's details (title, authors, journal, year, DOI, PubMed ID), subspecialty, month, summary and commentary with their authors, key points, the review state (`DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED`), who wrote and published it, and its discussion post (`post_id`).
- `journal_club_votes`: one per person and entry (a unique index), with the answer.
- `journal_club_history` (append-only, like `news_history`).
- `notification_kind` gains `JOURNAL_CLUB`, in a migration of its own.

**Server:** a `journal-club` module: entries, review, the archive, the poll; it opens the discussion post through the communities module and fills the article through `PubMedSource`. Permissions: `journalclub.write` and `journalclub.publish`, given to `CONTENT_EDITOR` and `SUBSPECIALTY_ADMIN` (§9 question 1).

**Site:** Journal club in the main menu (the current entry, the archive); an entry with its summary, commentary, poll and discussion; Administration → Journal club to write, submit and publish.

**App:** the current entry, the archive, an entry with its poll and the way to its discussion.

## 6. New libraries, services and costs (each needs the owner's approval)

- **None.** PubMed is already used (M27), with the same rule: only the identifier is sent.

## 7. Tests

- Server: review (the writer can't publish their own), the poll (one answer each, changeable, counts only, nobody sees who), the discussion post opening in the right community, the patient-details check, who sees what, the notice.
- Browser tests in both languages with accessibility checks; app tests of the new screens.

## 8. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Data, entries and review
3. Poll and discussion
4. Archive and notices
5. Site
6. App
7. Demo data, documents, status, demo script

## 9. Questions for the owner

1. **Who writes and who publishes an entry?** Recommended: content editors and subspecialty admins write; another of them publishes. The summary and commentary each name the member who wrote them.
2. **Who sees the journal club?** Recommended: verified people see entries, vote and discuss (as communities). Alternative: anyone sees the summary; verified people vote and discuss.
3. **Where is the discussion?** Recommended: a post in the subspecialty's community, opened with the entry (moderation, reports and notices come with it). Alternative: comments on the entry page itself, separate from communities.
4. **Demo data?** Recommended: 3 entries about made-up articles, without real PubMed IDs or DOIs, written about training and research methods, never clinical advice (as in M25 and M27). Alternative: real articles, which need the owner's review of every summary before they show.

## 10. Owner answers (2026-10-24)

1. **Editors write, another publishes:** content editors and subspecialty admins write; a different one of them publishes. Summary and commentary name their authors.
2. **Verified people only** see entries, vote and discuss.
3. **The discussion is a post in the subspecialty's community,** opened when the entry is published.
4. **Demo data: 3 made-up articles,** without real PubMed IDs or DOIs, about training and research methods, no clinical advice.

## 11. Risks

| Risk                                         | What is done about it                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Nobody writes the summaries                  | Named editors and a schedule before real use; the demo shows the shape only |
| A summary reads as clinical advice           | Named authors, review before publishing, and the owner's review of content  |
| Copyright                                    | No article text is stored or shown; a link only                             |
| The poll is taken as evidence or a guideline | Labelled as members' opinions, counts only                                  |
