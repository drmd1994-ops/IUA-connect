# M23: The full question bank

**Status: approved by the owner on 2026-10-23 with the answers in §10. Proposed on 2026-10-07; checked against the code and rewritten on 2026-10-19 (§0b).**

Track: Phase 2. Size: L (was M; the checks in §0b add an import, a report button and a reviewer line). Needs first: questions. Today there are ten; a bank needs hundreds, written and reviewed by physicians (§9, question 1).

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. It is a platform feature. The people who write and review the questions are recruited by the operator.

## 0b. What I checked on 2026-10-19

**What exists (M6, changed by M16 and M17):**

- **A question:** one stem, options with exactly one right one, an explanation for each option, and a topic summary, in Hebrew and English. It also has a level (student to expert, or none), one of the 11 subspecialties, and an access tier (public, verified physicians, members, or membership types).
- **Review:** draft → in review → published → archived, with four eyes (the person who submits a question cannot publish it). The history is append-only. Since M16 the two permissions, `education.manage` (write) and `education.review` (publish), belong to the platform: a content editor writes, a platform admin publishes.
- **Practice (`/education/exam` and the app's exam screen):** a random published question for a chosen level and subspecialty, not repeating within one visit. The right answer leaves the server only in the reply to an answer. Practice is open to visitors, whose answers are not stored. A signed-in person's answers are stored, and only the first answer to a question counts.
- **"My exam results":** a total score, and a list of the person's answers. Only that person can read it.
- **The admin's question editor** (`/admin/education/questions`) has one question at a time and no import.
- **Content:** ten real teaching questions, drafted by me and read and approved by the owner on 2026-10-02, loaded published.

**What is missing for §1:** difficulty; references on a question; practice that avoids questions answered right recently, across visits; the mock exam; progress over time and by topic; weak topics; bookmarks and "the ones I got wrong"; statistics per question; a way to report a bad question; showing who reviewed a question; and importing many questions at once.

**Topics:** the 11 subspecialties exist and are already on every question, so I propose they are the topics (§9, question 2) rather than a second list.

**Where questions can come from:** the official board exams and commercial banks are copyrighted, so nothing is copied from them. Questions are written new (§9, question 1).

## 1. Goal

A resident practises by topic, sits a timed mock exam, sees which topics are weak, and bookmarks questions to return to. Every question shows who reviewed it and the reference it rests on.

**Why:** Practice exists one question at a time. The specification (§23) asks for mock exams, progress, weak-topic analysis and bookmarks.

## 2. Scope

**In**

- **On every question:**
  - a difficulty (easy, medium, hard), set by the author;
  - references, shown with the explanation;
  - "Reviewed by … on …": the person who published it, and the date.
- **Practice by topic and level,** in random order, leaving out what the person answered right in the last 30 days, across visits. Visitors practise as now.
- **The mock exam,** for a signed-in person:
  - they choose the number of questions (10, 25 or 50) and the topics;
  - 90 seconds a question, with the clock kept by the server;
  - no answers until the end, then a review of every question with its explanations;
  - an exam left unfinished closes itself when its time is up.
- **Progress:** by topic and over time, from first answers only. A topic is "weak" when the person answered at least 5 of its questions and got less than 60% right (§9, question 4).
- **Bookmarks, and "the ones I got wrong":** each can be practised as a set.
- **Report a question:** a signed-in person says what is wrong. The report goes to the question reviewers' queue, and the person is told when it is dealt with.
- **For staff:**
  - **Statistics per question:** how many answered it and the share who got it right, and how often each option was chosen. A number is shown only once at least 5 people answered, so nobody can be picked out.
  - **The report queue.**
  - **Import:** a spreadsheet template (CSV, opened in Excel) with one question per row, in Hebrew and English. Imported questions arrive as drafts and go through the same review; nothing imported is published by the import.
- **On the site and in the app,** in Hebrew and English.
- **Content:** I draft a starter set of new questions spread over the 11 topics, written from public guidelines (EAU, AUA) and textbooks' general knowledge, each with its reference. Every one waits for review, and nothing is published until a physician publishes it (§9, question 1).

**Not in**

- Official exams, or anything that counts for certification or CME (CME is M22).
- Questions with images. They need files in review and a viewer; a later step if wanted.
- Teachers or programme directors seeing a resident's results (§9, question 3).
- Questions copied from the board exams, the AUA's SASP or any other bank.

## 3. Rules

- The right answer never reaches the reader before they answer. In a mock exam, it doesn't reach them before the exam ends.
- The server keeps the exam's clock. An answer after the time is not counted.
- A person's answers, exams, bookmarks and reports are theirs alone, deleted with their account. Staff see totals per question, never who answered what, and see who sent a report only when they deal with it.
- A question with a report waiting stays published unless a reviewer takes it down.
- No question is published without a reviewer other than its author (as now).

## 4. What is built

**Data:**

- On a question: difficulty, references, the reviewer and the date (taken from the publish step).
- New: mock exams and their questions; bookmarks; reports.
- The existing answers table is kept. An answer in a mock exam is stored there too, marked with its exam.

**Server:** the education module's exam part grows the mock exam, progress, bookmarks, reports, statistics and import.

**Site and app:** practice with the new filters; the mock exam; progress; bookmarks and wrong answers; the report button.

**Admin (site only, as now):** the statistics, the report queue and the import.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected. The spreadsheet is read as CSV without a library.

## 6. Tests

- A mock exam can't be seen early or made longer: the answers stay hidden until the end, the server's clock rules, and a late answer is refused.
- Weak-topic numbers match a hand-worked example, counting first answers only.
- Staff statistics never show a person, and show no numbers under 5 answers.
- Practice leaves out questions answered right in the last 30 days.
- The import: a good file loads as drafts; a bad row is refused with its row number and the reason; nothing is published by the import.
- A person reads only their own exams, bookmarks and reports.
- Browser tests of the mock exam and progress in both languages, with accessibility checks; app tests of the same screens.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Difficulty, references, the reviewer line, and the import
3. Practice by topic that avoids recent right answers
4. The mock exam
5. Progress and weak topics
6. Bookmarks and wrong answers
7. Report a question; staff statistics and the report queue
8. The app
9. The starter set of questions, waiting for review
10. Documents, status, demo

## 8. Risks

| Risk                                                     | What is done about it                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| There are too few questions for any of this to be useful | The starter set (§2), and the import for physicians who write more. Progress and weak topics say how few questions they rest on. |
| A wrong "right answer" misleads residents                | Four eyes before publishing; the reviewer's name and the reference shown on every question; the report button                    |
| Copyrighted questions slip in                            | Only new questions; the import template asks for the source; the reviewer is asked to confirm it                                 |
| Someone works out who answered what from the statistics  | No numbers under 5 answers; no per-person view for staff                                                                         |

## 9. Questions for the owner

My recommendation: **(1)** I draft a starter set of 100 new questions (about 9 per topic), and you review and publish them, as with the first ten; **(2)** the 11 subspecialties are the topics, and the bank prepares for the Israeli urology board exams without claiming to match them; **(3)** nobody else sees a person's results; **(4)** the numbers in §2 as written.

1. **Who writes and reviews the questions?** Should I draft a starter set for you to review (how many?), and will anyone else write or review?
2. **The topics and the exam:** the 11 subspecialties as topics? And which exam is it for (the Israeli board exams, parts A and B, or nothing named)?
3. **Teachers:** should a programme director see a resident's results? (Proposed: no.)
4. **The numbers:** mock exams of 10, 25 or 50 questions at 90 seconds each; "weak" below 60% with at least 5 answered; statistics shown from 5 answers; right answers left out of practice for 30 days. Keep or change?
5. **Who may sit a mock exam:** any signed-in person, or verified physicians and students only? (Proposed: any signed-in person, on the questions they may read.)

## 10. Owner answers

Given on 2026-10-23, when the owner said "start m23" and chose my recommendation for each question:

1. **Questions:** I draft a starter set of 100 new questions (about 9 per topic); the owner reviews and publishes them, as with the first ten.
2. **Topics and exam:** the 11 subspecialties are the topics. The bank prepares for the Israeli urology board exams without claiming to match them.
3. **Teachers:** nobody else sees a person's results, programme directors included.
4. **The numbers:** kept as written: mock exams of 10, 25 or 50 questions at 90 seconds each; weak below 60% with at least 5 answered; statistics from 5 answers; right answers left out of practice for 30 days.
5. **Who sits a mock exam:** any signed-in person, on the questions they may read.
