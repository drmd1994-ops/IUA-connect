# M32: Governance: bodies, meetings, documents and surveys

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: After Phase 3. Size: M. Needs first: The association's bylaws, to model its bodies correctly.

## 1. Goal

Members see the association's board and committees, their meetings and published minutes, and answer surveys; committee members have a private place for their papers.

**Why:** Specification §28.

## 2. Scope

**In**

- Bodies: the board, committees, subspecialty sections; who sits on each and in what role, with dates.
- Meetings: date, agenda, documents, minutes; published to members when approved.
- A private area per body for drafts and papers (files with their own read rule).
- Surveys of members: questions, who may answer, anonymous or named, results.
- Announcements from a body (through the existing broadcasts, with their two-person approval).
- On the site and in the app (reading; managing stays on the site).

**Not in**

- Elections and binding votes (M33).
- A full document-management system.

## 3. Rules

- A body's private papers are read only by its members; staff do not read them by default.
- An anonymous survey stores no link between a person and their answers; it records only that the person answered.

## 4. What is built

**Data:** `bodies`, memberships with roles and dates, `meetings`, documents, `surveys`, answers.

- Server: a `governance` module. Site: public pages, the private areas, survey building. App: reading and answering.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Who reads a body's papers; minutes before and after approval; a survey's anonymity; one answer per person.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Bodies and their members
3. Meetings and minutes
4. Private areas
5. Surveys
6. App
7. Documents, status, demo

## 8. Risks

| Risk                              | What is done about it                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| The model does not fit the bylaws | The bylaws are read first; the plan is corrected before approval |

## 9. Questions for the owner

1. Can you share the bylaws?
2. Which bodies exist today?
3. Are minutes public to all members?

## 10. Owner answers

None yet.
