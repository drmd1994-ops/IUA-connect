# M6 — Education: plan

- Status: **Draft (revised 2026-10-02), waiting for the owner's approval**
- Date: 2026-10-02
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M6. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.7 (education)
  - `DATABASE_DESIGN.md` §3 (`education_items`, translations, files)
  - `API_DESIGN.md` §4 (`/education`, `/admin/education`)
  - Spec §12 (education); §13 (CME) is Phase 2
  - Owner decisions D7 (access tiers) and D8 (video hosting), answered in §11
- Revision: the owner asked for an **exam question demo** in this milestone (§2.10, §11.4–8). The full question bank stays in Phase 2.

## 1. Goal and exit criteria

Members browse an education library ("IUA Academy") by type, level and subspecialty, and open articles, documents, presentations and links to videos. They practise exam questions one at a time and see why each answer is right or wrong. Editors add items and questions; an IUA admin reviews and publishes them.

**Exit criteria (roadmap):**

- Tier enforcement tests.
- The video decision recorded in an ADR.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M6**

1. **Education items**
   - The nine types of spec §12: video, article, PDF, presentation, podcast, webinar, surgical video, case, course.
   - Metadata: title and description (Hebrew and English, with the Hebrew fallback), author, subspecialty, level (student, resident, fellow, specialist, expert, or all levels), duration in minutes, CME points, references, publication date.
   - An access tier on every item, default public (D7).
   - A cover image (optional).
2. **How each type is delivered**
   - **Video, webinar, surgical video, podcast:** a link to where it is hosted (§11.1). The page shows the host's name and opens the link there. An item can also be marked "video pending" when it has no link yet.
   - **PDF and presentation:** an uploaded file (the M3 files module), downloaded through a signed address.
   - **Article and case:** text written in the editor (Markdown, sanitised like news), with optional attachments.
   - **Course:** an ordered list of other items (§11.3).
3. **Courses**
   - A course holds lessons in a set order; a lesson is any other item (not another course). An item can belong to several courses.
   - Each lesson keeps its own access tier. A lesson the reader may not see is shown as a locked line ("for members") without its title, so the numbering stays whole.
4. **Review workflow** (§11.2), for items and for exam questions
   - Draft → in review → published → archived. The reviewer can send it back with a comment.
   - Four eyes: whoever submitted an item can't approve it.
   - A reviewer may correct an item while it is in review, before approving it.
   - An append-only history per item; every step is audited. The editor is emailed when an item is sent back or published.
5. **Library pages (he/en)**
   - `/education`: filters by type, level and subspecialty; paged.
   - `/education/[slug]`: the item, delivered by its type; for a course, the numbered lessons.
   - The home page's "Education" card becomes a link; "Education" joins the header.
6. **Admin (`/admin/education`)**
   - List with a status filter (reviewers start on the review queue), the editor, course lessons with reordering, review actions.
7. **Search columns:** Hebrew-normalised search vectors on titles and descriptions (the search screen is M7).
8. **ADR 0008:** the video decision.
9. **Demo seed:** fictional items of every type, one course, and items in every workflow state. No real lectures, authors or patients.
10. **Exam question demo** (§11.4–8)
    - **A question:** the question text, 2 to 6 options with exactly one right answer, an explanation for **every** option (why it is right, or why it is wrong), and a short summary of the topic. Hebrew and English; subspecialty and level; an access tier, default public.
    - **The practice page (`/education/exam`), exactly this layout:**
      1. One multiple-choice question is shown, with its options.
      2. The reader picks an option and confirms.
      3. The page then shows the right answer, the explanation of why it is right, the explanation of why each other option is wrong, and the short topic summary.
      4. "Next question" brings another one. Filters by subspecialty and level.
    - **The answer stays on the server** until the reader has answered: the right option and the explanations are not sent with the question.
    - **Saved answers (§11.8):** for signed-in people, every answer is stored. `/account/exam-results` shows their score and the questions they answered. Visitors can practise public questions; nothing is saved for them.
    - **Who sees results:** only the person themself. Admins see no individual results in this milestone. Results are deleted with the account.
    - **Writing questions:** editors write them in `/admin/education/questions`; an IUA admin reviews and publishes (the same workflow and permissions as items).
    - **The demo's questions (§11.5):** Claude drafts about 10 sample urology questions. They are loaded **in review, not published**, so nobody sees them until the owner, as the urologist, has corrected and approved each one. The spec forbids inventing clinical guidance, so nothing Claude writes is shown without that review.

**Not in M6**

| Item                                            | Where                                             |
| ----------------------------------------------- | ------------------------------------------------- |
| Uploading or hosting video                      | After the pitch (D8, §11.1)                       |
| Playing videos inside the page                  | Not chosen (§11.1): links open on the host's site |
| CME tracking and certificates                   | Phase 2 (CME points are shown, not tracked)       |
| Progress, "mark as done", bookmarks for items   | Phase 2                                           |
| Timed exams, exam simulations, question sets    | Phase 2 (the full question bank)                  |
| Statistics about questions or people for admins | Phase 2                                           |
| Images in questions                             | Phase 2                                           |
| Search over education                           | M7                                                |
| Scheduled publishing of education items         | Not planned (news has it)                         |

## 3. Roles and rules (proposed defaults)

- **Writing:** `education.manage` (CONTENT_EDITOR and IUA_ADMIN, as seeded).
- **Reviewing and publishing:** a new permission, `education.review`, given to IUA_ADMIN. This changes the permission catalogue (one new row); SUPER_ADMIN gets it automatically.
- **Transitions** (items and questions):

  | Transition            | Who      | Rule                                                       |
  | --------------------- | -------- | ---------------------------------------------------------- |
  | Draft → in review     | editor   | Hebrew text required                                       |
  | In review → draft     | reviewer | a comment is required                                      |
  | In review → published | reviewer | not the person who submitted it                            |
  | Published → draft     | reviewer | "take down to edit" (see below)                            |
  | Published → archived  | reviewer | hidden from the library; link still works, marked archived |

- **Editing:** drafts are edited by editors; an item in review can be corrected by a reviewer. To change a published item it is taken back to draft, edited, and reviewed again; it is hidden in the meantime. News has "revisions" that keep the old text live during an edit; that is not built here. (Part of what you approve with this plan.)
- **Patient privacy:** cases, surgical videos and exam questions must hold no identifiable patient information (standing rule). The editor shows this reminder; the demo holds fictional cases only.
- **Links:** only `http` and `https` addresses. The page names the host the link leads to.
- **Courses:** publishing a course doesn't publish its lessons; only published lessons are shown.
- **Exam answers:** the first answer to a question counts for the score; answering again is allowed and stored, but doesn't change the score. An archived question keeps its stored answers.

## 4. Database (migrations)

New tables: `education_items`, `education_translations`, `education_files`, `course_items`, `education_history` (append-only), `exam_questions`, `exam_question_translations`, `exam_options`, `exam_option_translations`, `exam_answers`.

- Enums: type (9 values), level (5 values), status (4 values), video status (none, external, pending).
- Checks: a slug format; a published item has its date; duration and CME points not negative; link schemes; a course item is never itself a course; lesson positions unique within a course; a question has exactly one right option (a partial unique index).
- Search vectors kept current by a trigger; trigram index on titles.
- `content_access_rules` gains the `education` and `exam_question` entities (no schema change).
- Permission catalogue: `education.review`.
- `exam_answers` rows belong to the person and go when the account is deleted.

## 5. API (under `/api/v1`)

- **Public (tier-filtered):** `GET /education` (type, level, subspecialty filters; paged), `GET /education/{slug}`.
- **Exam practice (tier-filtered):**
  - `GET /exam-questions/next` (subspecialty and level filters; skips questions already seen in this visit): the question and its options, **without** the answer.
  - `POST /exam-questions/{id}/answer`: returns the right option, every option's explanation and the topic summary; stores the answer when the caller is signed in.
  - `GET /me/exam-results`: the caller's own score and answered questions.
- **Admin:** `/admin/education` (list, create, get, update with `If-Match`, delete a draft, transitions, history), `/admin/education/{id}/lessons` (set the ordered lessons of a course), `/admin/exam-questions` (the same set of routes for questions).
- Every admin route gets the anonymous 401 / member 403 / admin-without-MFA 403 / admin 2xx tests.

Deviation to approve: public pages use a URL name (`/education/{slug}`) like news and events, where `API_DESIGN.md` wrote `/education/{id}`.

## 6. Tests

- **Unit:** the workflow and the four-eyes rule; which fields each type needs before it can be submitted (a video needs a link or "pending", a PDF needs a file, an article needs text; a question needs one right option and an explanation for every option); link checks; lesson ordering; scoring.
- **Integration:**
  - **Tiers:** every read as anonymous, signed in without a membership, active member of each type, suspended. Hidden items and questions are left out of lists and answer 404 by link. Files of an item follow the item's tier.
  - Courses: order kept; a lesson hidden from the reader shows as locked, without its title; a course can't hold a course.
  - **Exam questions:** the question never carries the right answer or the explanations before it is answered; answering returns all of them; a signed-in person's answers are stored and a visitor's are not; results are the caller's own only; unpublished questions are never served.
  - The workflow, including send-back, correction in review and take-down; `If-Match`; history append-only.
  - The admin access pattern on every admin route.
- **End to end (Playwright):**
  - An editor writes an article and a video-link item and builds a course from them; a reviewer publishes all three; a visitor browses the library, filters it, opens the course and a lesson; a members-only lesson shows as locked.
  - An editor writes an exam question; a reviewer corrects and publishes it; a member answers it, sees the right answer, each explanation and the summary, and finds it under "my results".
  - Axe checks on every new page in he and en.

## 7. Order of work (a commit at each checkpoint; tests green at each)

1. Schema; permission; items, translations and files; admin API with the review workflow.
2. Courses and lessons.
3. Public library API under tiers; file read rule.
4. Exam questions: schema, admin API, practice and results API.
5. Web: library list and item page; the exam practice page and "my results".
6. Web: admin list, editor, lessons, questions, review.
7. ADR 0008; demo seed (items, a course, the draft exam questions); end-to-end tests and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/education`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

Working practice from M5: checkpoints are pushed less often, so a CI run can finish between pushes, and I check its result before the next one.

## 8. Risks

| Risk                                               | Mitigation                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Wrong medical content in exam questions            | Claude's drafts are never published by the seed; the owner corrects and approves each one; a note in the history says so |
| Patient information in cases, videos or questions  | Fictional demo content only; a reminder in the editor; a reviewer must approve everything                                |
| The right answer leaking before the reader answers | The answer and explanations are only in the reply to an answer; tested                                                   |
| Stored answers are data about a person's knowledge | Visible only to that person; no admin view; deleted with the account                                                     |
| Links to other sites going stale or unsafe         | Only http(s); the host is shown before the reader follows the link; an admin can archive                                 |
| Copyrighted lectures, papers or exam questions     | The demo uses made-up items and newly written questions; real content needs the rights holder's permission               |
| Hiding a published item while it is corrected      | Stated above; revisions like news can be added later if it proves a problem                                              |

## 9. Questions for the owner

Asked before this plan was written and revised; answers in §11.

## 10. Checkpoint test

The owner will test the demo after M6 is finished (said 2026-10-02).

## 11. Owner answers (2026-10-02)

1. **Video (D8):** **links to videos hosted elsewhere.** An item holds a link to a video on YouTube, Vimeo or any other site, and it opens there. No upload, no embedded player, no hosting provider for now. A real provider can be chosen after the pitch.
2. **Publishing:** **a second person reviews, as for news.** An editor submits; an IUA admin reviews and publishes; whoever submitted can't approve their own item.
3. **Courses:** **a course groups items in order,** shown as numbered lessons.
4. **Exam question demo** (asked for by the owner when reviewing the first draft of this plan): a section in this milestone. **The layout:** a multiple-choice question is asked; after the reader answers, the page gives the right answer, the explanation of why it is right and why the others are wrong, and a short summary of the topic.
5. **Where the questions come from:** **Claude drafts about 10 sample urology questions; the owner reviews.** They are loaded unpublished, and the owner corrects and approves them in the admin screen. Nothing Claude writes is shown without that review.
6. **Managing questions:** **an admin editor with review**, in Hebrew and English, the same as other education items.
7. **Who can practise:** **set per question, default everyone** (the same access tiers as other content).
8. **Saved answers:** **yes, each answer is saved** for signed-in people, who see their history and score.
