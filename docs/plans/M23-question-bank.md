# M23: The full question bank

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: M. Needs first: Questions. Today there are ten sample ones; a bank needs hundreds, written and reviewed by physicians.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. A platform feature, open to verified users. The people who write and review questions are recruited by the operator.

## 1. Goal

A resident practises by topic, sits a timed mock exam, sees which topics are weak, and bookmarks questions to return to.

**Why:** Exam practice exists one question at a time with answers remembered; the specification (§23) asks for mock exams, progress, weak-topic analysis and bookmarks.

## 2. Scope

**In**

- Topics and difficulty on every question; references shown with the explanation.
- Practice by topic and level, in random order, not repeating what was answered right recently.
- A mock exam: a fixed number of questions, a clock, no answers until the end, then a review.
- Progress over time and by topic; "weak topics" worked out from first answers.
- Bookmarks, and "the ones I got wrong".
- Staff: sets of questions, statistics per question (how many get it right), flagging a bad question.
- On the site and in the app.

**Not in**

- Official exams or anything that counts for certification.
- Writing the questions (people do that; an import format is provided).

## 3. Rules

- The right answer never reaches the reader before they answered (as now).
- A person's results are theirs alone; staff see totals per question, not who answered what.

## 4. What is built

**Data:** Topics; question sets; exam attempts; bookmarks. The existing answers table is kept.

- Server: extends the education module's exam part. Site and app: practice, mock exam, progress, bookmarks; admin: sets, statistics, import.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- A mock exam cannot be peeked at or extended by changing the clock on the device (the server keeps the time).
- Weak-topic numbers match a hand-worked example.
- Staff statistics never reveal a person.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Topics, difficulty, import
3. Practice by topic
4. Mock exam
5. Progress and weak topics
6. Bookmarks
7. Admin statistics
8. App
9. Documents, status, demo

## 8. Risks

| Risk                                                     | What is done about it                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| There are too few questions for any of this to be useful | Said first; the milestone is worth starting only with a source of questions   |
| A wrong "right answer" misleads residents                | Every question carries its reviewer and date; a "report this question" button |

## 9. Questions for the owner

1. Who writes and reviews the questions, and how many exist?
2. Which exam is this preparing for, and what are its topics?
3. Should teachers see a resident's results? (Proposed: no, unless the resident shares them.)

## 10. Owner answers

None yet.
