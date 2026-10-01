# M3 — Content core: plan

- Status: **Approved by the owner on 2026-09-30**
- Date: 2026-09-30
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M3. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.5 (news) and §3.8 (guidelines)
  - `DATABASE_DESIGN.md` §3 (content; files) and §5 (search columns)
  - `API_DESIGN.md` §4 (files, admin news and guidelines)
  - `SECURITY_MODEL.md` (input and output; files)
  - ADR 0003 (pg-boss) and ADR 0005 (translation tables)
  - Spec §9 (news) and §14 (guidelines)
  - Owner decisions D7 (access tiers, default PUBLIC), D11 and D15 (demo adapters)

## 1. Goal and exit criteria

Editors write news in Hebrew and English. A reviewer approves it, and it is published at once or at a scheduled time. Guidelines are listed with their metadata and the official link. Every item has an access tier (public, members, or chosen membership types). Files (images and documents) are uploaded safely, and members can add a profile photo (deferred from M2).

**Exit criteria (roadmap):**

- An end-to-end test: editor → reviewer → scheduled publish.
- Tier enforcement tests.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M3**

1. **Files module**
   - Upload (multipart), with an allow-list: JPEG, PNG, PDF, DOC/DOCX, PPT/PPTX. SVG and HTML are blocked. MP4/MP3 wait for the video decision (M6).
   - The type is detected from the content (magic bytes), never from the name or the header. Each type has its own size limit.
   - **Images are re-encoded, and all metadata (EXIF, GPS) is removed.**
   - Stored outside the web root under random keys, through the `ObjectStorage` interface (local-disk adapter). Scanned through the `MalwareScanner` interface: a no-op adapter marks files UNSCANNED, and the app refuses to start in production with it.
   - Downloads only through **short-lived signed URLs**, after an access check. Documents are served as attachments.
   - Uploads: admin and editor roles only in demo mode (D15). **Exception:** a member's own profile photo (image only, see §4).
2. **Job queue**
   - pg-boss behind a `JobQueue` interface (ADR 0003), in its own `pgboss` schema, started with the API.
   - First job: scheduled publishing. It retries failures, and the same job running twice is harmless.
3. **News**
   - Every spec §9 field: title, summary, body, author, category, tags, publication date, featured image, attachments, references, status.
   - Workflow: DRAFT → IN_REVIEW → SCHEDULED or PUBLISHED → ARCHIVED; the reviewer can send it back to DRAFT with a comment. Every transition is audited and kept in the item's history.
   - Translations per locale (ADR 0005). A missing translation falls back to Hebrew, with a visible notice.
   - Slugs (Hebrew or Latin), categories (admin-editable, he/en), free tags.
   - Source fields (`source_url`, original date) are ready for the M4 import.
4. **Rich text:** the body is Markdown (§11). It is sanitised on the server with an allow-list when saved, and rendered safely.
5. **Access tiers (D7)**
   - PUBLIC (default), MEMBERS (an active membership), or TYPES (chosen membership types, active).
   - Applied on every read: hidden items are left out of lists, and a direct link returns 404.
   - Built once, used by news, guidelines and files now, and later by events (M5) and education (M6).
6. **Guidelines (minimal, PRODUCT_REQUIREMENTS §3.8):**
   - Metadata: source organisation, title (he/en), date, version, status, evidence level, subspecialty, official link.
   - Version history (each version has its own date and link).
   - An optional IUA-written summary (he/en).
   - **No copies of third-party guideline documents** (spec §14).
7. **Hebrew-aware search columns** (DATABASE_DESIGN §5): a `normalize_he` function strips niqqud and folds final letters. Each translation row gets a search vector, kept current by a trigger. The search API itself is M7.
8. **Web (he/en)**
   - Public: news list and article page, guidelines list and page.
   - Admin: a news editor with preview; a review queue (approve, send back, schedule); categories; guidelines; file upload in the editor.
   - Member: upload a profile photo.
9. **Demo seed:** fictional news items in every workflow state, guidelines for demonstration (real organisations named only as the source, with links), and a CONTENT_EDITOR demo account.

**Not in M3**

| Item                                    | Where                                     |
| --------------------------------------- | ----------------------------------------- |
| Importing real IUA website content      | M4                                        |
| Global search API and search screen     | M7 (M3 builds only the search columns)    |
| Notifications for review and publishing | M7 (M3 uses email to the editor only)     |
| Video upload and hosting                | M6 (D8, ask the owner first)              |
| Showing profile photos to others        | M7 member directory (M3: the member only) |
| Home dashboard with news                | M8 (M3 has the news list page)            |

## 3. Workflow and roles (proposed defaults)

- **Existing permissions (M1 catalogue):**
  - `news.create`: CONTENT_EDITOR and IUA_ADMIN.
  - `news.review` and `news.publish`: IUA_ADMIN.
  - `guidelines.manage` and `files.upload`: as seeded.
- **Four eyes:** the person who submits an item for review **can't approve it** (§11).
- **Transitions:**

  | Transition            | Who                     | Rule                                                        |
  | --------------------- | ----------------------- | ----------------------------------------------------------- |
  | DRAFT → IN_REVIEW     | the author or an editor | —                                                           |
  | IN_REVIEW → DRAFT     | reviewer                | a comment is required                                       |
  | IN_REVIEW → PUBLISHED | reviewer                | publishes now                                               |
  | IN_REVIEW → SCHEDULED | reviewer                | needs a future time; the job publishes it then              |
  | SCHEDULED → DRAFT     | reviewer                | cancels the schedule                                        |
  | PUBLISHED → ARCHIVED  | publisher               | hidden from lists, still reachable by link, marked archived |

- **Editing:**
  - Only DRAFT items can be edited.
  - Editing a published item creates a new draft **revision**; the published version stays live until the revision is published.
  - Concurrent edits are caught with ETag / `If-Match` (SECURITY_MODEL "Tampering").
- **Scheduling:**
  - Times are entered in Israel time and stored in UTC.
  - If the job runs late (the API was down), it publishes on the next start.

## 4. Files: details

- **Allow-list and limits:**
  - JPEG/PNG: 10 MB.
  - PDF: 25 MB.
  - DOCX/PPTX: 25 MB. Old DOC/PPT are only accepted if their content is recognised.
- **Images:**
  - Decoded and re-encoded (JPEG/PNG → WebP or JPEG), dropping every metadata block.
  - Resized to at most 2400 px, plus a thumbnail.
  - Pixel limits reject "decompression bombs".
- **Documents:**
  - Stored as uploaded (no re-encoding), after type detection.
  - Office files are checked to be ZIP containers of the declared kind.
  - Served only as attachments with `X-Content-Type-Options: nosniff`.
- **Profile photo:**
  - The member uploads **their own** image only (one at a time), 5 MB at most.
  - It has its own visibility setting (PHOTO, private by default; §11). Until the member directory (M7), only the member sees it.
- **Access:**
  - A file inherits the access of what uses it: a public article's image is public, a members-only article's attachment needs an active membership.
  - Unused files (never attached) are deleted after 24 hours by a job.
- **Signed URLs:** HMAC-signed, 5 minutes, bound to the file, served by the API under `/files/{id}/content?sig=...`.

## 5. Database (migrations)

New tables (DATABASE_DESIGN §3):

- `files`
- `news`, `news_translations`, `news_revisions`, `news_attachments`, `news_tags`, `tags`
- `news_categories` and translations
- `news_history` (append-only)
- `content_access_rules` (for TYPES)
- `guidelines` and translations, `guideline_versions`
- `profiles.photo_file_id`
- pg-boss's own `pgboss` schema (created by pg-boss, with grants for the app role)

Also: the `normalize_he` SQL function, search-vector triggers, and `pg_trgm` indexes on normalised titles.

## 6. API (under `/api/v1`)

- **Files:**
  - `POST /files` (multipart)
  - `GET /files/{id}/url` (signed URL)
  - `GET /files/{id}/content` (signed, streams the file)
  - `PUT /me/profile/photo` and `DELETE /me/profile/photo`
- **Public (tier-filtered):**
  - `GET /news`: paged, category and tag filters
  - `GET /news/{slug}`
  - `GET /news/categories`
  - `GET /guidelines` and `GET /guidelines/{id}`
- **Admin:**
  - `/admin/news`: list with status filter, create, get, update with `If-Match`, `POST /admin/news/{id}/transitions`, revisions
  - `/admin/news/categories`
  - `/admin/guidelines` (+ versions)
- **Access:** every admin route gets the 401/403/403/2xx tests. Tier tests run each content read as anonymous, member without a membership, active member of each type, expired, and suspended.

## 7. Web (he/en)

- **Public:** `/news` (paged list), `/news/[slug]` (article with featured image, attachments, references, fallback notice), `/guidelines`, `/guidelines/[id]`.
- **Admin:**
  - `/admin/news`: list, editor, preview, review queue, schedule with a date-time picker in Israel time.
  - `/admin/news/categories`, `/admin/guidelines`.
- **Member:** a photo on My profile.
- **Editor:** a WYSIWYG editor (TipTap) that saves Markdown (§11); keyboard-accessible, RTL and LTR per language tab.

## 8. Tests

- **Unit:**
  - Workflow state machine and four-eyes rule.
  - Tier policy (every tier × every membership state).
  - Sanitiser (XSS vectors, allowed markup).
  - `normalize_he`.
  - File type detection (renamed files, polyglots, SVG/HTML blocked).
  - Image metadata stripping (a JPEG with GPS EXIF comes out without it).
  - Signed-URL signing and expiry.
- **Integration:**
  - Upload limits and type rejection; access checks on downloads.
  - Full workflow including scheduling: the job publishes, and running it twice publishes once.
  - Revisions of published items; ETag conflicts.
  - Fallback to Hebrew; tier filtering in lists and 404 on direct fetch.
  - Admin access pattern on every admin route; audit and history entries.
- **End to end (Playwright):** the exit test. An editor writes an article with an image, submits it; a reviewer schedules it a minute ahead; it appears on `/news` after the job runs; a members-only article is hidden from a visitor. Plus axe checks on every new page in he and en.

## 9. Order of work (a commit at each checkpoint; tests green at each)

1. Files module (storage and scanner adapters, type detection, image re-encoding, signed URLs) and the profile photo.
2. Job queue (pg-boss behind `JobQueue`).
3. Access tiers (policy and `content_access_rules`).
4. News schema, translations, search columns, admin API and workflow.
5. Scheduled publishing, revisions, public news API.
6. Guidelines.
7. Web screens (public, admin editor and review, profile photo).
8. Demo seed; Playwright exit test and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/content`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

## 10. Risks

| Risk                                             | Mitigation                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Rich text is the classic XSS source              | Server-side allow-list sanitiser on write; rendered as structured content, never raw HTML; XSS test vectors                      |
| Uploaded files carrying malware or tracking data | Type from content, allow-list, image re-encoding, no-op scanner refused in production, uploads limited to staff (plus own photo) |
| Native image library on Windows                  | sharp ships prebuilt Windows binaries (§11); CI runs Linux                                                                       |
| Real organisation names in demo guidelines       | Only as the named source with a link; no copied content (spec §14)                                                               |

## 11. Owner answers (2026-09-30)

1. **Libraries:**
   - **sharp** re-encodes images and strips their metadata.
   - **file-type** detects the type from the content.
   - Both follow the supply-chain rules (7-day release age, audit).
2. **Article body:** stored as **Markdown**, written with a **WYSIWYG editor (TipTap)** that saves Markdown. It is sanitised on the server and rendered without raw HTML.
3. **Four eyes:** the person who submitted an item **can't approve it**; a second person reviews.
4. **Publishing:** only **IUA admins** review and publish (as seeded); content editors write and submit.
5. **Profile photo:** has its **own "who can see this" setting** (a new PHOTO field, private by default).
6. **Markdown libraries** (asked at checkpoint 4, 2026-10-01):
   - Server: **unified/remark** parses each body and keeps only allowed elements (raw HTML is dropped).
   - Web: **react-markdown** renders bodies as React elements, never as raw HTML.
   - Editor: TipTap's Markdown extension.
7. **Guideline fields** (asked at checkpoint 6, 2026-10-01):
   - **Status:** Current, Superseded or Withdrawn. Superseded and withdrawn guidelines stay listed, clearly marked.
   - **Evidence level:** optional free text (organisations use different scales).
