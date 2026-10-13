# M26: Case discussions and the case of the week

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: L. Needs first: M20's legal review before real use. Best after M25 (it reuses comments and moderation).

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. A platform feature. The moderators who review every case are recruited by the operator.

## 1. Goal

A member presents a de-identified case in a fixed form; colleagues discuss it; staff choose a case of the week.

**Why:** Specification §16. It is the feature where patient information is most likely to slip in, so it is planned around preventing that.

## 2. Scope

**In**

- A case in a fixed form: title, age range (never an age), sex, history, labs, imaging, pathology, the question, subspecialty.
- Images only after an explicit step: the author confirms they carry no name, number, date or face; file data (EXIF, DICOM headers) is stripped; DICOM files are refused.
- An automatic warning for text that looks like identifying details, before submitting.
- Every case is reviewed by a moderator before anyone else sees it.
- Threaded comments, editable and reportable; an optional poll ("what would you do?"), anonymous.
- Case of the week on the member's home.
- On the site and in the app.

**Not in**

- Any identifiable patient information, in any field.
- Cases visible to non-members.
- Consultation about a live patient ("what should I do today"): the standing note says this is education, not advice.

## 3. Rules

- Nothing is published without a moderator's review. A rejected case is returned to its author with the reason.
- An age is a range; a date is never asked for; an institution is not shown on the case.
- A report hides a case at once, pending review.
- Deleting a case deletes its images.

## 4. What is built

**Data:** `cases`, case images (purpose CASE, own read rule), comments (shared with M25), polls and votes.

- Server: a `cases` module; the review queue; image handling stricter than chat's. Site and app: the form, the case, the discussion, the queue.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected beyond the image library already used.

## 6. Tests

- An unreviewed case is invisible to everyone but its author and moderators.
- File data is stripped from images; a DICOM file is refused.
- The warning fires on identity numbers, names after "Mr/Mrs/מר/גב׳", dates of birth, phone numbers.
- A poll never reveals who voted what.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. The form and the review queue, with tests
3. Images and stripping
4. Comments and reports
5. Polls
6. Case of the week
7. App
8. Documents, status, demo

## 8. Risks

| Risk                                                                                                  | What is done about it                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A picture identifies a patient despite everything (a tattoo, a rare finding, text burned into a scan) | Human review of every case; said as a residual risk; the lawyer decides whether images are allowed at all |
| Moderators are slow and cases wait                                                                    | The queue shows waiting time; more than one moderator per subspecialty                                    |

## 9. Questions for the owner

1. Images: allowed with review, or text only at first?
2. Who reviews cases, and how fast must they?
3. May the author be anonymous to readers (known to moderators)?

## 10. Owner answers

None yet.
