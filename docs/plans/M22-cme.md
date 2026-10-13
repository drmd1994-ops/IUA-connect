# M22: CME: activities, credits and certificates

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: M. Needs first: Nothing technical. A decision by the association on what counts as CME.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. CME belongs to an organisation's section. The association, or another accredited body, awards the credits; the platform records them. Without such an organisation the platform can only issue certificates of completion, and must call them that.

## 1. Goal

A member sees the CME credits they earned through the association and downloads a certificate; staff define what gives credit and can correct a record.

**Why:** Events already record attendance and education items already carry CME points, but nothing is counted or credited (`KNOWN_LIMITATIONS.md`).

## 2. Scope

**In**

- An activity that gives credit: an event (by attendance), an education item (by completing it), or one entered by staff.
- A member's record per activity: date, credits, how it was verified.
- "My CME": totals per year, the list, and a certificate as a PDF with a code that the public verification page checks.
- Staff: define activities, see who earned what, correct or void a record with a reason, export.
- On the site and in the app.

**Not in**

- Reporting credits to an outside body (the Medical Association, the Scientific Council): its own plan if wanted.
- Quizzes as proof of completion, unless question 2 asks for them.

## 3. Rules

- A record is never edited silently: a correction is a new entry with a reason, and the audit log has it.
- A certificate states only what the records show, and can be checked by its code.
- Credits come from attendance that was recorded, never from registration alone.

## 4. What is built

**Data:** `cme_activities`, `cme_records` (append-only corrections), `cme_certificates`.

- Server: a `cme` module; hooks from attendance and from education completion; PDF generation.
- Site: "My CME", the admin screens. App: "My CME" under "Me", the certificate saved or shared.

## 5. New libraries, services and costs (each needs the owner's approval)

- A PDF library (for example `pdf-lib`), with a Hebrew font embedded.

## 6. Tests

- Credit is given once per activity; voiding removes it from totals; a correction leaves a trace.
- The certificate's code verifies; a changed PDF does not.
- Hebrew renders right-to-left in the PDF.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Data and rules, with tests
3. Credit from events
4. Credit from education
5. Certificates and verification
6. Admin screens
7. App
8. Documents, status, demo

## 8. Risks

| Risk                                                 | What is done about it                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| What "completing" an education item means is unclear | Question 2; the simplest honest rule is "opened and marked as done by the member", said on the certificate |
| Hebrew in PDFs is easy to get wrong                  | Tried at checkpoint 2 before anything else is built on it                                                  |

## 9. Questions for the owner

1. Who decides the credits of an activity, and are there official rules to follow?
2. What proves that an education item was completed?
3. What must the certificate say, and who signs it?

## 10. Owner answers

None yet.
