# Med Connect — Database Design

> **Since M16 (2026-10-13)** the product is **Med Connect**, an independent platform with a section for each organisation ([decision 0010](docs/adr/0010-a-platform-with-organisations.md)). Where this document still says "the association" or "IUA admin", read "an organisation" and "its administrator"; the section "M16" below is what holds now.

PostgreSQL 16+, accessed through Prisma. This document covers the **MVP schema** plus the tables reserved for later phases. The Prisma schema in `apps/api/prisma/schema.prisma` is the implementation of record.

## 1. Conventions

| Rule               | Detail                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys       | UUID v7 (`uuid` type), generated in the application. Time-ordered, so indexes stay efficient.                                                                                   |
| Public identifiers | Internal IDs aren't exposed where a slug or opaque public ID works better (news slugs, event slugs, membership card tokens).                                                    |
| Timestamps         | `created_at`, `updated_at` (`timestamptz`) on every table                                                                                                                       |
| Actor columns      | `created_by`, `updated_by` where editorial                                                                                                                                      |
| Soft deletion      | `deleted_at` on user-facing content (news, events, education, profiles). Never on audit or history tables.                                                                      |
| Naming             | `snake_case` tables and columns (Prisma `@@map` / `@map`)                                                                                                                       |
| Enums              | Postgres enums for stable sets (statuses). Lookup tables for sets admins can edit (membership types, subspecialties, categories).                                               |
| Money              | `numeric(12,2)` + `currency char(3)` — never float                                                                                                                              |
| Constraints        | Foreign keys everywhere. `CHECK` constraints for date ranges (`end >= start`) and non-negative amounts.                                                                         |
| Sensitive fields   | Encrypted at the application level (AES-256-GCM, key from env/secret store): `specialist_certificate_no`, TOTP secrets. Plus a keyed-hash (HMAC) column for uniqueness lookups. |
| Derived values     | Not stored (age, membership "is expired", etc.). Computed on read. The same pattern as MedOps.                                                                                  |

## 2. Entity overview (MVP)

```
users ─┬─ profiles ─── profile_field_visibility
       ├─ user_roles ── roles ── role_permissions ── permissions
       │        └── (scope: department_id | subspecialty_id | null)
       ├─ sessions ── refresh_tokens
       ├─ devices
       ├─ mfa_factors, recovery_codes
       ├─ memberships ── membership_types
       │      └── membership_history
       ├─ verification_requests ── verification_decisions
       ├─ event_registrations, event_attendance
       ├─ notifications, notification_preferences
       └─ consents

hospitals ── departments ── (directors via user_roles scope)
subspecialties ── profile_subspecialties

news ── news_translations, news_tags, news_attachments(files)
events ── event_translations, event_sessions ── session_speakers ── speakers
education_items ── education_translations, education_files
guidelines ── guideline_translations, guideline_versions

files (storage metadata, scan status)
audit_logs (append-only)
jobs (pg-boss's own schema: pgboss.*)
```

## 3. Key tables (MVP)

### Identity and access

- **users**
  - `id`, `email` (citext, unique), `email_verified_at`, `password_hash`, `status` (ACTIVE | LOCKED | DISABLED)
  - `failed_login_count`, `locked_until`, `locale`, `last_login_at`, timestamps
- **roles** (`key` unique, `name_key` for i18n)
- **permissions** (`key` unique, e.g. `news.publish`)
- **role_permissions**
- **user_roles**
  - `user_id`, `role_id`, `scope_type` (NONE | DEPARTMENT | SUBSPECIALTY), `scope_id`, `granted_by`, `granted_at`
  - Unique on (user, role, scope)
- **sessions** (`user_id`, `device_id`, `ip`, `user_agent`, `mfa_completed_at`, `revoked_at`, `expires_at`)
- **refresh_tokens** (`session_id`, `family_id`, `token_hash`, `used_at`, `replaced_by`, `expires_at`). Only the hash is stored.
- **mfa_factors** (`type` TOTP | WEBAUTHN, `secret_encrypted` / `credential_public_key`, `label`, `last_used_at`)
- **recovery_codes** (`code_hash`, `used_at`)
- **auth_tokens** (email verification and password reset: `purpose`, `token_hash`, `expires_at`, `used_at`)

### People and institutions

- **profiles**
  - `user_id` PK/FK, `first_name`, `last_name`, `name_he`, `name_en`, `title`, `position`, `hospital_id`, `department_id`
  - `bio`, `research_interests`, `orcid`, `languages text[]`, `contact_email`, `contact_phone`, `photo_file_id`
  - `directory_opt_in boolean default false`
- **profile_field_visibility** (`user_id`, `field`, `visibility` PRIVATE | MEMBERS | PUBLIC)
- **hospitals** (`name_he`, `name_en`, `city`, `active`)
- **departments** (`hospital_id`, `name_he`, `name_en`, `active`)
- **subspecialties** (seeded with the 11 from spec §17, with translations)

### Membership and verification

- **membership_types** (`key`: FULL_MEMBER | NON_FULL_MEMBER | RESIDENT | STUDENT | HONORARY_MEMBER, `requires_specialist_cert`, `annual_fee`, `currency`)
- **memberships**
  - `user_id`, `type_id`, `status` (PENDING | ACTIVE | EXPIRED | SUSPENDED | REJECTED), `start_date`, `end_date`
  - `payment_status` (NOT_REQUIRED | UNPAID | PAID | WAIVED), `source` (MANUAL | IMPORT | IMA)
  - `specialist_certificate_no_enc`, `specialist_certificate_no_hash`
- **membership_history** (append-only: `membership_id`, `from_status`, `to_status`, `changed_by`, `reason`, `at`)
- **verification_requests**
  - `user_id`, `department_id`, `requested_type_id`
  - `state` (PENDING_DIRECTOR | PENDING_ADMIN | APPROVED | REJECTED | WITHDRAWN), `flags` (e.g. NO_DIRECTOR)
- **verification_decisions** (`request_id`, `stage` DIRECTOR | ADMIN, `decided_by`, `decision`, `reason`, `at`)
- **card_tokens** are _not_ stored. QR tokens are signed JWTs (5-minute lifetime), verified with a key rotated through config.

### Content

- **news**
  - `slug` unique, `status` enum, `category_id`, `author_user_id`, `featured_image_file_id`
  - `publish_at`, `published_at`, `access_tier` (PUBLIC | MEMBERS | TYPES)
  - `source_url`, `source_published_at` (imported items), `references jsonb`
- **news_translations** (`news_id`, `locale`, `title`, `summary`, `body` (sanitized HTML/Markdown), `search_vector tsvector`). PK is (`news_id`, `locale`).
- **content_access_rules** (`entity_type`, `entity_id`, `membership_type_id`). Used when `access_tier = TYPES`.
- **events** (`slug`, `category_id`, `start_at`, `end_at`, `timezone`, `location_name`, `address`, `lat`, `lng`, `organizer`, `image_file_id`, `registration_mode` (INTERNAL | EXTERNAL | NONE), `registration_url`, `capacity`, `cme_available`, `access_tier`, `source_url`)
- **event_translations**, **event_sessions** (`room`, `start_at`, `end_at`) + **event_session_translations**
- **speakers** (optional `user_id` link) and **session_speakers**
- **event_registrations** (`event_id`, `user_id`, `status`, unique (`event_id`, `user_id`))
- **event_attendance** (`event_id`, `session_id` nullable, `user_id`, `method` QR | MANUAL, `recorded_by`, `at`)
- **education_items** (`type` enum per spec §12, `level`, `subspecialty_id`, `duration_minutes`, `cme_points numeric(5,2)`, `author`, `external_url`, `video_status` (NONE | EXTERNAL | PENDING_PROVIDER), `access_tier`) + translations + files
- **guidelines** (`source_org`, `official_url`, `evidence_level`, `status`, `subspecialty_id`) + **guideline_versions** (`version`, `published_on`, `url`, `license_note`)

### Files, notifications, consent, audit

- **files**
  - `storage_key`, `original_name`, `mime_type` (sniffed, not trusted from the client), `size_bytes`, `sha256`
  - `scan_status` (UNSCANNED | CLEAN | INFECTED | ERROR), `owner_user_id`, `visibility`
- **notifications** (`user_id`, `category`, `title_key`, `params jsonb`, `link`, `read_at`)
- **notification_preferences** (`user_id`, `category`, `channel`, `enabled`)
- **broadcasts** (`created_by`, `approved_by` (must differ), `status`, `audience_filter jsonb`)
- **consents** (`user_id`, `kind` TERMS | PRIVACY | DIRECTORY | EMAIL_MARKETING, `version`, `granted_at`, `withdrawn_at`)
- **audit_logs**
  - `id`, `at`, `actor_user_id`, `actor_ip`, `action`, `entity_type`, `entity_id`, `changes jsonb` (redacted), `correlation_id`
  - **Append-only**: the application's database role has `INSERT`/`SELECT` only. A trigger rejects `UPDATE`/`DELETE`.

### Reserved for later (schema stubs or documented only)

- **payments**, **invoices** (D4). Planned as empty tables in the MVP; **not created**. Memberships carry a `payment_status` set by hand. The tables come with the payments milestone.
- `conversations`/`messages` were created in M11 (private chat); see section 8.
- Phase 2+: `cme_*`, `cases*`, `community_*`, `research_*`, `publications`, `jobs`, `fellowships`, `mentors`, `logbook_entries`, `questions`, `governance_*`, `ai_*`. **Not** created until their milestone. Adding them as migrations later is cheap, and empty tables mislead.

## 4. Indexes (initial)

- `users(email)`, `memberships(user_id, status)`, `verification_requests(state, department_id)`
- `news(status, published_at desc)`, `events(start_at)`, `education_items(type, level, subspecialty_id)`
- GIN on each `*_translations.search_vector`; `pg_trgm` GIN on normalized titles
- `audit_logs(entity_type, entity_id, at desc)`, `audit_logs(actor_user_id, at desc)`, `audit_logs(at desc, id desc)` (added in M9 for the audit log page)

## 5. Search columns

`search_vector` is maintained by a trigger with `to_tsvector('simple', normalize_he(title || ' ' || summary || ' ' || body_text))`. `normalize_he` is an SQL function that strips niqqud and folds final letters (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ).

## 6. Migrations and seeding

- Prisma Migrate. Raw SQL migrations for triggers, grants, extensions (`citext`, `pg_trgm`, `pgcrypto`).
- Seed layers:
  1. **Reference:** roles, permissions, membership types, subspecialties, locales.
  2. **Demo:** fictional users, hospitals and departments (real hospital names are acceptable; people are fictional), directors, memberships at every workflow state.
  3. **Imported sample (no longer a layer since M16):** content once imported from a real association’s website (D11). The fixtures and `seedImport` remain, unused; `pnpm import:remove` takes an earlier sample out.
- `pnpm db:reset` rebuilds everything locally. Seeds refuse to run when `NODE_ENV=production`.

## 7. Retention (initial proposal, pending legal review)

| Data                           | Retention                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Audit logs                     | 7 years (proposal)                                                                                  |
| Sessions / refresh tokens      | Purged 30 days after expiry                                                                         |
| Rejected verification requests | 1 year                                                                                              |
| Deleted account                | Profile hard-deleted after a 30-day grace period. Audit entries keep the pseudonymous user ID only. |
| Chat messages (M11)            | Kept until a person deletes them or the account is deleted; **no automatic deletion yet**. The period is for the legal review. The copy of messages kept with a report is erased 90 days after the report is closed. |

## 8. As built (end of the MVP, M9, and chat in M11)

Sections 2 to 5 are the design written before the code. **The schema that runs is `apps/api/prisma/schema.prisma` and the migrations beside it**; where they differ from the design above, they win. Each milestone's plan (`docs/plans/`) explains its tables. The differences worth knowing:

**Columns named differently from the design**

| Design (section 3)                                                         | As built                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `membership_types.requires_specialist_cert`                                | `identifier` (none, specialist certificate, medical licence), `self_apply`, `director_approval`                                        |
| `specialist_certificate_no_enc`, `specialist_certificate_no_hash`          | `identifier_enc`, `identifier_hash` (the number may be a certificate or a licence number; still encrypted, with a keyed hash)          |
| `verification_requests.requested_type_id`                                  | `type_id`                                                                                                                             |
| `notifications` (`category`, `title_key`)                                  | `kind`, `type`, `params`: a notice is stored as a type and its details and worded in the reader's language when shown                 |
| `broadcasts` (`approved_by`, `audience_filter jsonb`)                      | `decided_by` (never the author; a database check), `audience_all` plus chosen membership types; texts in `broadcast_translations`      |

**Tables added while building**

| Table                                                                                                                | What it holds                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `import_batches`                                                                                                     | A CSV membership import: the dry-run report and a keyed hash of the file, never the file                                  |
| `news_categories`, `event_categories`                                                                                | Categories with Hebrew and English names                                                                                  |
| `news_history`, `education_history`, `exam_question_history`                                                         | Who moved an item through review, when and with what comment. Append-only at the database level                           |
| `speaker_translations`, `session_materials`                                                                          | A speaker's texts per language; files attached to a session                                                               |
| `schedule_items`                                                                                                     | Sessions a registered member put in their personal schedule                                                               |
| `event_reminders`                                                                                                    | A reminder that was sent, written before the email goes out, so none is sent twice                                        |
| `course_items`                                                                                                       | The lessons of a course, in order (a course is never a lesson; a trigger checks it)                                       |
| `exam_questions`, `exam_question_translations`, `exam_options`, `exam_option_translations`                           | Multiple-choice questions: exactly one right option, each option with its explanation, and a summary                      |
| `exam_answers`                                                                                                       | A signed-in person's answers, visible only to them and deleted with their account                                         |
| `content_announcements`, `announcement_reads`, `notification_state`                                                  | Newly published items announced once (one row per item, not per person), and what each person has read                    |
| `broadcast_translations`, `broadcast_deliveries`                                                                     | A message's texts per language; one row per person it reached, so nobody receives it twice                                |
| `settings`                                                                                                           | Site settings (contact details, notice banner); the database accepts only the known keys                                  |

**Chat (M11)**

Private conversations and rooms share these tables; a room adds a kind and its own columns (M12, below). Nothing existing was changed by the migration.

| Table                                         | What it holds                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations`                               | A conversation. For a direct one: its two people, smaller id first, with a unique index (one conversation per pair). `last_seq` numbers the messages; the next message takes the next number under a row lock |
| `conversation_members`                        | A person in a conversation: how far they have read and received (**two numbers per person, not a row per message**), "marked unread", mute and archive                                                      |
| `messages`                                    | Plain text, its number inside the conversation (`unique (conversation_id, seq)`, which serves paging and the unread count), the message it replies to, edited and deleted times, and a search column maintained by a trigger. Deleting for everyone erases the text and keeps the row |
| `message_hides`                               | "Delete for me": a row only for a message a person hid from their own side                                                                                                                                 |
| `chat_blocks`                                 | Who blocked whom                                                                                                                                                                                           |
| `chat_preferences`                            | Who can write to me, read status, typing, and when the last "messages are waiting" email went out. A missing row means the starting settings                                                               |
| `chat_report_categories`, `chat_reports`      | The reasons for reporting (rows, seeded), and reports with a kept copy of the reported message and the five on each side                                                                                   |
| `chat_suspensions`                            | A person staff suspended from sending in chat, from when until when, and who lifted it                                                                                                                     |

Typing is never stored.

**Chat rooms (M12)**

A room is a row of `conversations` with kind `ROOM`. Two migrations, additions only; the two enums that gain a value (`ROOMS` for notification kinds, `ROOM_ARCHIVED` for report actions) are changed in a migration of their own, because PostgreSQL can't use a new enum value in the transaction that adds it.

| Table or columns                                    | What it holds                                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations` (new columns)                       | For a room: Hebrew name (unique among rooms) and English name, descriptions, category, picture, "moderators only", locked and until when, archived, who opened it, and `member_count` (kept by the join and leave code, so lists never count rows). A check keeps these empty for a direct conversation |
| `conversation_members.role`                         | `MEMBER` or `MODERATOR` (the column existed since M11)                                                                                                                                                        |
| `messages` (new columns)                            | `announcement`, `removed_by` (set when a moderator or staff deleted it, not its sender), `mentions` (the people mentioned, all in the room when it was sent)                                                   |
| `chat_room_categories`                              | What rooms are grouped by. Rows, edited by staff                                                                                                                                                              |
| `message_reactions`                                 | One row per person, message and reaction. The six reactions are fixed in code                                                                                                                                 |
| `message_pins`                                      | A pinned message. A trigger refuses a sixth pin in a room                                                                                                                                                     |
| `conversation_bans`                                 | A person banned from one room: by whom, why, from when until when, and who lifted it                                                                                                                          |

Rooms are archived, never deleted.

**Groups, invitations, activity and files in messages (M13)**

Three migrations, additions only, except that two check constraints are replaced by wider ones (below). New enum values (`GROUP`, the member role `ADMIN`, the file kind `VIDEO`, the file purpose `CHAT`) are in a migration of their own.

| Table or columns                              | What it holds                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations` (kind `GROUP`, `invite_only`) | A group is a conversation of kind `GROUP`: one name (kept in `name_he`), who made it, `member_count`. `invite_only` marks a room that is joined by invitation and never listed                              |
| `conversation_members` (`ADMIN`, `pinned_at`) | A group's admin; and a conversation pinned to the top of that person's list. A trigger refuses a sixth pin                                                                                                 |
| `conversation_invitations`                    | An invitation to a group or a room: who, by whom, until when, and how it ended (accepted, declined, withdrawn, expired). One open invitation per person per conversation (a partial unique index)           |
| `chat_preferences` (three columns)            | `invites_from` (who may invite me), `show_activity`, and `last_active_at`: one time per person, written at most every ten minutes and when their last chat page closes. **"Online" is not stored**          |
| `messages.forwarded`                          | A copy of a message from elsewhere. Nothing records where it came from                                                                                                                                     |
| `message_attachments`                         | Message, file, position (0 to 2). A forwarded message points at the same stored file, so a file is erased when its last attachment goes                                                                    |

**Two rules that were widened:**

- `conversations_room_fields` now knows three kinds: a room, a group (a name, no pair, none of a room's settings), and a direct conversation.
- `messages_text` said that a message that is not deleted has text. A message may now be files without a text, so the database keeps only the other half (a deleted message has no text); the API checks that a message has a text or a file.

## 9. Organisations (M16)

- **`organisations`**: `id`, `slug` (unique, in addresses), `name_he`, `name_en`, `description_he`, `description_en`, `active`. The first one has a fixed id, so the migration could move every existing row to it.
- **`organisation_id` NOT NULL:** `membership_types`, `memberships`, `verification_requests`, `import_batches`. A membership type's key is unique within its organisation; a person has one open application per organisation.
- **`organisation_id` nullable (null: the platform's own):** `news`, `events`, `speakers`, `conversations` (rooms), `broadcasts`, `user_roles`, `content_announcements`.
- **No organisation:** education items, exam questions, guidelines, the category lists, report reasons, users, hospitals and departments, the audit log, settings.
- **`users.verified_at`**: when the account became a verified physician. Set when an organisation accepts or imports the person.
- **`access_tier`** gained `VERIFIED`. Check constraints: `MEMBERS` needs an owning organisation; the platform's library has no `MEMBERS`.
- **`user_roles`**: unique on (user, role, scope, organisation) with nulls counted as equal, so a role is granted once in each place.
- Six migrations (`20261013090000` to `20261013090500`), additions and backfills only.

## 10. Verification by the platform (M17)

- **`users.verified_as`** (`SPECIALIST`, `RESIDENT`, `PHYSICIAN`, `STUDENT`) and **`users.verified_until`** beside `verified_at`. A check constraint keeps `verified_at` and `verified_as` together. Empty `verified_until`: no end (an organisation vouches for the person). The migration filled `verified_as` from each person's strongest membership type.
- **`physician_verifications`**: one request to be verified: the kind, the state (`PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `REVOKED`, `EXPIRED`), the licence and certificate numbers encrypted with keyed hashes, a student's school, expected graduation and confirmation file, the person's note, and when the person was told it ends. One waiting request per person; a licence number in one waiting and one approved request at most (partial unique indexes); a check constraint says what each kind gives.
- **`physician_verification_decisions`**: who decided what and why, and what the register showed (its status, whether the numbers matched). Kept when the confirmation file is deleted.
- **`medical_schools`**: Israel's six medical schools (reference data).
- **`platform_invitations`**: who invited, a keyed hash of the address, when, and when an account was made with it.
- **`file_purpose`** gained `VERIFICATION`.
- Three migrations (`20261014090000` to `20261014090200`), additions and one backfill.

## 11. Jobs, fellowships and mentorship (M28)

- **`positions`**: a job, fellowship or research post (`kind`), its review state (`DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED`), the owner (`organisation_id`, empty for the platform's own and for a department director's), the place (a hospital and department from the list, or `institution_name` with `city` and `country`), who it is for (`audience`), how to apply (`apply_url`, `apply_email`), `closes_on`, and who wrote, submitted and reviewed it. Check constraints: one place, never both; a department belongs to its hospital; at least one way to apply; a two-letter country code.
- **`position_translations`**, **`position_subspecialties`**, **`position_history`** (append-only, like `news_history`).
- **`saved_positions`**: a person's saved positions, theirs alone.
- **`mentor_profiles`** and **`mentor_subspecialties`**: a verified specialist's offer to mentor: listed or not (`open`), interests, time, languages, and how many mentees at once (`capacity`, 1 to 10).
- **`mentorships`**: a request and the mentorship it becomes (`PENDING`, `ACCEPTED`, `DECLINED`, `WITHDRAWN`, `EXPIRED`, `ENDED`), with the message and, once accepted, the private conversation. One open request or mentorship per pair (a partial unique index); a person can't ask themselves.
- **`notification_kind`** gained `POSITIONS` and `MENTORSHIP`, in a migration of their own.
- Two migrations (`20261023090000`, `20261023161839`), additions only.

## 12. Communities (M25)

- **`communities`**: one for each subspecialty (`subspecialty_id`, unique) and others staff open; `slug` in addresses, names and descriptions in Hebrew and English, `archived_at` when closed.
- **`community_moderators`**, **`community_bans`** (with a reason and an optional end), **`community_follows`**.
- **`posts`**: a question or a discussion in a community, with its writer, title and text, the comment marked as the answer, when it was edited, locked or removed (by whom and why), its latest activity and number of comments, and a search vector kept by a trigger.
- **`post_comments`**: one level of replies (`parent_id`), with the same edit and removal fields and its own search vector.
- **`post_files`**, **`post_reactions`** and **`comment_reactions`** (chat's six reactions, by a check constraint), **`post_bookmarks`**, **`post_follows`**.
- **`chat_reports`** gained `post_id` and `comment_id`: a post or a comment is reported into chat's queue.
- **`notification_kind`** gained `COMMUNITIES`, in a migration of its own.
- **Chat rooms closed:** the migration archives every room (`conversations.archived_at`); nothing is deleted.
- Three migrations (`20261023190000` to `20261023190200`), additions and the archiving.

## 13. Research projects and publications (M27)

- **`research_projects`**: a study that seeks collaborators, listed by a verified physician (`lead_id`): title and description (checked for patient details), `study_type`, `status`, the ethics approval as the lead declares it (`ethics`), funding, contact, what it looks for (`needs`, an array), whether it takes requests (`open`), `ended_at`, and its chat group (`group_id`, unique, a group conversation). `confirmed_at` is when the lead last saved it, and `stale_asked_at` when they were asked once whether it is still current, a year later.
- **`research_project_subspecialties`**.
- **`research_requests`**: asking to join a project (`PENDING`, `ACCEPTED`, `DECLINED`, `WITHDRAWN`, `EXPIRED`), with the message. One open or accepted request per person and project (a partial unique index).
- **`publications`**: a person's own publications: title, authors, journal, year (a check: 1900 to 2100), DOI, PubMed ID, link, topics, where it came from (`source`: typed in, PubMed or ORCID), `hidden`, and the person's order (`position`).
- **`notification_kind`** gained `RESEARCH`, in a migration of its own.
- Two migrations (`20261024090000`, `20261024090100`), additions only.

## 14. Journal club (M31)

- **`journal_club_entries`**: an article presented to members: its details and links (title, authors, journal, year, DOI, PubMed ID), never its text; the subspecialty, the month (its first day, by a check constraint), the language of the texts (`he` or `en`, by a check), the summary and the expert's commentary with their authors (`summary_author_id`, `commentary_author_id`), key points, the review state (`DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED`), who wrote, submitted and published it, and its discussion post in the subspecialty's community (`post_id`, unique).
- **`journal_club_votes`**: one answer per person and entry ("Would this change your practice?": `YES`, `PERHAPS`, `NO`), changeable. Only totals are ever shown; nobody, staff included, sees who answered what.
- **`journal_club_history`**: every review step, append-only (like `news_history`).
- **`notification_kind`** gained `JOURNAL_CLUB`, in a migration of its own; it is a kind of new content, so its emails go in the daily summary.
- Two migrations (`20261024120000`, `20261024120100`), additions only.

## 15. Case discussions (M26)

- **`cases`** (`ClinicalCase`): a case in a fixed form: the author, the subspecialty, a title, an age range (`case_age_range`, never an age), sex, the history and optional examination, laboratory results, imaging, pathology and what was done, and the question. No column for a date, a place or an institution. The state (`DRAFT`, `IN_REVIEW`, `RETURNED`, `PUBLISHED`, `HIDDEN`, `REMOVED`), who reviewed it, when and the reason, when it was published, its discussion post (`post_id`, unique), and `week_at` (the latest is the case of the week).
- **`case_files`**: its pictures, stored files with the new purpose `CASE`, readable only by those who can read the case.
- **`case_poll_options`** (1 to 4, by a check) and **`case_votes`** (one per person and case, changeable; totals only).
- **`case_reports`**: a report hides the case; it waits in the cases review queue until closed (owner answer §10.6).
- **`case_history`**: every step, append-only.
- **`notification_kind`** gained `CASES`, and **`file_purpose`** gained `CASE`, in a migration of their own.
- Two migrations (`20261024150000`, `20261024150100`), additions only.

## 16. Medical imaging (M36)

- **`scans`** (`Scan`): one de-identified study: its uploader, the case or library item it is attached to (never both, by a check), its place among them, a **new** study identifier (the original is never stored), the kinds of images, the number of images and their size, and when it was attached. Unattached scans are removed after a day; a scan goes with its case or item.
- **`scan_series`**: its series, each with a new identifier, the kind of images, its number and how many images it has.
- **`scan_instances`**: one image file each: a new identifier, the kind of DICOM object, its number, where its cleaned file is stored, its size, and its attributes as DICOM JSON without binary values (what the viewer reads first).
- One migration (`20261024180000`), additions only. The image files are stored like any upload, outside the web root.
