# M29: Journal club

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 3. Size: S to M. Needs first: M25 (publications) and M23 (comments) make it small. AI summaries need M31.

## 1. Goal

Each month an article is presented with a summary and an expert's commentary, and members discuss it.

**Why:** Specification §20.

## 2. Scope

**In**

- An entry: the article (by PubMed identifier or DOI, linking to the publisher), a summary written by a member, an expert commentary, references.
- Discussion in threads; a poll ("would this change your practice?").
- An archive by subspecialty; a notice when a new one opens.
- On the site and in the app.

**Not in**

- Hosting the article's full text (copyright): a link only.
- AI-written summaries, until M31; then clearly marked and citing the article, as the specification requires.

## 3. Rules

- The article is linked, never copied.
- A summary names its author and is reviewed before publishing.

## 4. What is built

**Data:** `journal_club_entries`, linked to a publication; comments and polls reused.

- Server: a small module on top of publications and comments. Site and app: the entry, the archive.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Review before publishing; the poll's anonymity; the link to the publisher.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Entries and review
3. Discussion and poll
4. Archive and notices
5. App
6. Documents, status, demo

## 8. Risks

| Risk                        | What is done about it                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Nobody writes the summaries | A named editor and a schedule before building; otherwise not worth building |

## 9. Questions for the owner

1. Who chooses the article and writes the summary each month?
2. Open to residents and students?

## 10. Owner answers

None yet.
