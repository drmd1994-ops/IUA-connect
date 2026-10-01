# M6 — Education: plan

- Status: **Draft, waiting for the owner's approval**
- Date: 2026-10-02
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M6. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.7 (education)
  - `DATABASE_DESIGN.md` §3 (`education_items`, translations, files)
  - `API_DESIGN.md` §4 (`/education`, `/admin/education`)
  - Spec §12 (education); §13 (CME) is Phase 2
  - Owner decisions D7 (access tiers) and D8 (video hosting), answered in §11

## 1. Goal and exit criteria

Members browse an education library ("IUA Academy") by type, level and subspecialty, and open articles, documents, presentations and links to videos. Editors add items and group them into courses; an IUA admin reviews and publishes them.

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
4. **Review workflow** (§11.2)
   - Draft → in review → published → archived. The reviewer can send it back with a comment.
   - Four eyes: whoever submitted an item can't approve it.
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

**Not in M6**

| Item                                    | Where                                             |
| --------------------------------------- | ------------------------------------------------- |
| Uploading or hosting video              | After the pitch (D8, §11.1)                       |
| Playing videos inside the page          | Not chosen (§11.1): links open on the host's site |
| CME tracking and certificates           | Phase 2 (CME points are shown, not tracked)       |
| Progress, "mark as done", bookmarks     | Phase 2                                           |
| Quizzes and the question bank           | Phase 2                                           |
| Search over education                   | M7                                                |
| Scheduled publishing of education items | Not planned (news has it)                         |

## 3. Roles and rules (proposed defaults)

- **Writing:** `education.manage` (CONTENT_EDITOR and IUA_ADMIN, as seeded).
- **Reviewing and publishing:** a new permission, `education.review`, given to IUA_ADMIN. This changes the permission catalogue (one new row); SUPER_ADMIN gets it automatically.
- **Transitions:**

  | Transition            | Who      | Rule                                                       |
  | --------------------- | -------- | ---------------------------------------------------------- |
  | Draft → in review     | editor   | Hebrew title required                                      |
  | In review → draft     | reviewer | a comment is required                                      |
  | In review → published | reviewer | not the person who submitted it                            |
  | Published → draft     | reviewer | "take down to edit" (see below)                            |
  | Published → archived  | reviewer | hidden from the library; link still works, marked archived |

- **Editing:** only drafts are edited. To change a published item it is taken back to draft, edited, and reviewed again; it is hidden in the meantime. News has "revisions" that keep the old text live during an edit; that is not built here. (Part of what you approve with this plan.)
- **Patient privacy:** cases and surgical videos must hold no identifiable patient information (standing rule). The editor shows this reminder on those two types; the demo holds fictional cases only.
- **Links:** only `http` and `https` addresses. The page names the host the link leads to.
- **Courses:** publishing a course doesn't publish its lessons; only published lessons are shown.

## 4. Database (migrations)

New tables: `education_items`, `education_translations`, `education_files`, `course_items`, `education_history` (append-only).

- Enums: type (9 values), level (5 values), status (4 values), video status (none, external, pending).
- Checks: a slug format; a published item has its date; duration and CME points not negative; link schemes; a course item is never itself a course; lesson positions unique within a course.
- Search vectors kept current by a trigger; trigram index on titles.
- `content_access_rules` gains the `education` entity (no schema change).
- Permission catalogue: `education.review`.

## 5. API (under `/api/v1`)

- **Public (tier-filtered):** `GET /education` (type, level, subspecialty filters; paged), `GET /education/{slug}`.
- **Admin:** `/admin/education` (list, create, get, update with `If-Match`, delete a draft, transitions, history), `/admin/education/{id}/lessons` (set the ordered lessons of a course).
- Every admin route gets the anonymous 401 / member 403 / admin-without-MFA 403 / admin 2xx tests.

Deviation to approve: public pages use a URL name (`/education/{slug}`) like news and events, where `API_DESIGN.md` wrote `/education/{id}`.

## 6. Tests

- **Unit:** the workflow and the four-eyes rule; which fields each type needs before it can be submitted (a video needs a link or "pending", a PDF needs a file, an article needs text); link checks; lesson ordering.
- **Integration:**
  - **Tiers:** every read as anonymous, signed in without a membership, active member of each type, suspended. Hidden items are left out of lists and answer 404 by link. Files of an item follow the item's tier.
  - Courses: order kept; a lesson hidden from the reader shows as locked, without its title; a course can't hold a course.
  - The workflow, including send-back and take-down; `If-Match`; history append-only.
  - The admin access pattern on every admin route.
- **End to end (Playwright):** an editor writes an article and a video-link item and builds a course from them; a reviewer publishes all three; a visitor browses the library, filters it, opens the course and a lesson; a members-only lesson shows as locked. Axe checks on every new page in he and en.

## 7. Order of work (a commit at each checkpoint; tests green at each)

1. Schema; permission; items, translations and files; admin API with the review workflow.
2. Courses and lessons.
3. Public library API under tiers; file read rule.
4. Web: library list and item page.
5. Web: admin list, editor, lessons, review.
6. ADR 0008; demo seed; end-to-end test and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/education`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

Working practice from M5: checkpoints are pushed less often, so a CI run can finish between pushes, and I check its result before the next one.

## 8. Risks

| Risk                                           | Mitigation                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Patient information in cases or surgical video | Fictional demo content only; a reminder in the editor; a reviewer must approve every item |
| Links to other sites going stale or unsafe     | Only http(s); the host is shown before the reader follows the link; an admin can archive  |
| Copyrighted lectures or papers                 | The demo uses made-up items; real content needs the rights holder's permission            |
| Hiding a published item while it is corrected  | Stated above; revisions like news can be added later if it proves a problem               |

## 9. Questions for the owner

Asked before this plan was written; answers in §11.

## 10. Checkpoint test

The owner will test the demo after M6 is finished (said 2026-10-02).

## 11. Owner answers (2026-10-02)

1. **Video (D8):** **links to videos hosted elsewhere.** An item holds a link to a video on YouTube, Vimeo or any other site, and it opens there. No upload, no embedded player, no hosting provider for now. A real provider can be chosen after the pitch.
2. **Publishing:** **a second person reviews, as for news.** An editor submits; an IUA admin reviews and publishes; whoever submitted can't approve their own item.
3. **Courses:** **a course groups items in order,** shown as numbered lessons.
