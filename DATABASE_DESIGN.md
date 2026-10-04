# IUA Connect — Database Design

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
  3. **Imported sample:** the curated IUA website content (D11), kept as JSON fixtures in `apps/api/prisma/fixtures/iua-import/`.
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

Private conversations and the later rooms share these tables; a room adds a kind and its own columns in M12. Nothing existing was changed by the migration.

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

Typing is never stored. Reactions, attachments, pins and room bans have no tables yet: each comes with the milestone that uses it.
