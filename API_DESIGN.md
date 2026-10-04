# IUA Connect — API Design

REST over HTTPS, JSON, base path **`/api/v1`**. OpenAPI 3.1 is generated from the NestJS decorators and Zod schemas. Swagger UI is at `/api/docs` in development and staging only.

## 1. Conventions

| Topic          | Convention                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource names | Plural, kebab-case: `/news`, `/events/{slug}/sessions`, `/verification-requests`                                                                                             |
| IDs in URLs    | Slugs for public content, UUIDs for everything else                                                                                                                          |
| Locale | `Accept-Language: he` or `en`, or `?locale=`. Content says which language it is in (`locale` on each item), because an item written only in Hebrew is served in Hebrew to English readers. (A `Content-Language` header was planned and is not sent.) |
| Pagination | `?page=&pageSize=` → `{ items: [...], total }` on the lists that page. (Cursor-based paging was planned; it was not built.) |
| Filtering      | Explicit allow-listed query params (`?status=published&category=...`). No generic filter language.                                                                           |
| Sorting | Each list has a fixed order, for example newest first for news and soonest first for upcoming events. (A `?sort=` parameter was planned and is not built.) |
| Dates          | ISO 8601 UTC. Events also carry an IANA `timezone` (`Asia/Jerusalem`).                                                                                                       |
| Idempotency | `Idempotency-Key` on creating a broadcast only. (It was also planned for event registrations; payments come later.) |
| Concurrency    | `ETag` / `If-Match` on editable content to prevent lost updates in the CMS                                                                                                   |
| Caching | Every answer says `Cache-Control: no-store`, because answers hold personal or members-only data. Two exceptions: the public reference lists (five minutes) and a file fetched through its signed address (five minutes, in that person's browser only). |
| Versioning     | Breaking changes go to `/api/v2`. Additive changes are allowed within v1.                                                                                                    |

## 2. Error envelope (spec §55)

```json
{
  "error": {
    "code": "MEMBERSHIP_NOT_ACTIVE",
    "message": "errors.membership.notActive",
    "details": [{ "field": "email", "code": "INVALID_FORMAT" }],
    "correlationId": "01J..."
  }
}
```

- `code` is a stable machine code. `message` is an **i18n key** the client translates. Raw internals never leave the server.
- Status codes used: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found (also used in place of 403 where existence itself is sensitive), 409 conflict, 412 precondition failed, 422 business rule, 429 rate limited, 500 generic.

## 3. Authentication flow

1. `POST /auth/login` with `{ email, password }`. Returns one of:
   - `{ accessToken, expiresIn }` plus the refresh cookie, or
   - `{ mfaRequired: true, mfaToken }`
2. `POST /auth/mfa/verify` with `{ mfaToken, code }`. Returns the tokens.
3. `POST /auth/refresh`. The cookie plus the CSRF header rotate the refresh token and return a new access token.

Access tokens are JWTs signed with EdDSA, 10-minute lifetime. Claims: `sub`, `sid`, `mfa` (boolean), `iat`, `exp`. **Roles and permissions are not in the token**: they're resolved server-side per request (cached per session), so revocation takes effect immediately.

## 4. Endpoint catalogue (MVP)

### Auth

| Method | Path                                          | Notes                                                                |
| ------ | --------------------------------------------- | -------------------------------------------------------------------- |
| POST   | /auth/register                                | Always returns 202. Doesn't reveal whether the email already exists. |
| POST   | /auth/verify-email                            | Token from email                                                     |
| POST   | /auth/login                                   | Rate-limited per IP and per account                                  |
| POST   | /auth/mfa/verify                              |                                                                      |
| POST   | /auth/refresh                                 | Cookie + CSRF                                                        |
| POST   | /auth/logout                                  | Current session                                                      |
| POST   | /auth/password/forgot                         | Always 202                                                           |
| POST   | /auth/password/reset                          |                                                                      |
| GET    | /auth/sessions                                | Own sessions                                                         |
| DELETE | /auth/sessions/{id}                           | Revoke one                                                           |
| DELETE | /auth/sessions                                | Revoke all except current                                            |
| POST   | /auth/mfa/totp/setup · /auth/mfa/totp/confirm | Returns an otpauth URI and QR                                        |
| DELETE | /auth/mfa/{factorId}                          | Requires re-authentication                                           |
| POST   | /auth/mfa/recovery-codes                      | Regenerate (re-auth)                                                 |

### Me / profiles / directory

| Method    | Path                         | Notes                                                                       |
| --------- | ---------------------------- | --------------------------------------------------------------------------- |
| GET/PATCH | /me                          | Account basics, locale                                                      |
| GET/PATCH | /me/profile                  | Including per-field visibility                                              |
| GET       | /me/membership               | Status and history                                                          |
| GET       | /me/membership/card-token    | Short-lived signed QR token                                                 |
| GET/PUT   | /me/notification-preferences |                                                                             |
| GET/POST  | /me/consents                 |                                                                             |
| GET       | /members                     | Directory: opted-in only, active members only, rate-limited, no bulk export |
| GET       | /members/{id}                | Visibility-filtered view                                                    |
| GET       | /card/verify?t=              | Public. Returns valid/invalid, name, type only.                             |

### Verification

| Method | Path                                  | Permission                                                                            |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| POST   | /verification-requests                | The registrant (one open request at a time)                                           |
| GET    | /verification-requests/mine           | The registrant                                                                        |
| GET    | /verification-requests?stage=director | `membership.approve.department` (scoped to own departments)                           |
| GET    | /verification-requests?stage=admin    | `membership.approve.final`                                                            |
| POST   | /verification-requests/{id}/decisions | `{ decision: APPROVE\|REJECT, reason }`. The stage is inferred and the scope checked. |

### Reference data

`GET /hospitals`, `GET /hospitals/{id}/departments`, `GET /subspecialties`, `GET /membership-types`: public, cached.

### News, events, education, guidelines (public / member)

| Method      | Path                                               |
| ----------- | -------------------------------------------------- |
| GET         | /news · /news/{slug}                               |
| GET         | /events · /events/{slug} · /events/{slug}/sessions |
| POST/DELETE | /events/{slug}/registration                        |
| GET         | /me/schedule · /me/schedule.ics                    |
| GET         | /events/{slug}.ics                                 |
| GET         | /education · /education/{slug} · /me/exam-results  |
| GET         | /guidelines · /guidelines/{id}                     |
| GET         | /exam-questions/next                               |
| POST        | /exam-questions/{id}/answer                        |
| GET         | /search?q=&types=news,events,...                   |

Access tiers are enforced on every read. Items the caller may not see are omitted from lists and return 404 on direct fetch.

### Notifications

`GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /notifications/unsubscribe` (public; the signed token from an email), `GET /broadcasts/{id}` (a sent message, for its recipients)

### Chat (M11; every route needs a signed-in account, and the service checks that the caller is part of the conversation)

| Method             | Path                                   | Notes                                                                                             |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET                | /chat/conversations                    | The caller's conversations, newest activity first. `archived`, `q`, `cursor`, `limit`             |
| POST               | /chat/conversations                    | Opens the conversation with a person: 201 when new, 200 when it existed. Needs an active membership |
| GET                | /chat/conversations/{id}               | With whether the caller can send, and why not                                                     |
| PATCH              | /chat/conversations/{id}/me            | Mute, archive, mark as unread                                                                     |
| POST               | /chat/conversations/{id}/read          | Read up to a message, or to the end                                                               |
| POST               | /chat/conversations/{id}/typing        | "Is typing"; nothing is stored                                                                    |
| GET, POST          | /chat/conversations/{id}/messages      | Newest 50, `before` for older, `after` for catching up. Sending takes `Idempotency-Key`           |
| PATCH, DELETE      | /chat/messages/{id}                    | Edit (15 minutes) and delete for everyone: the sender only                                        |
| POST               | /chat/messages/{id}/hide               | Delete for me                                                                                     |
| GET                | /chat/search?q=&conversationId=        | The caller's own messages, by text                                                                |
| GET                | /chat/people?q=                        | Who the caller may start a conversation with                                                      |
| GET                | /chat/unread-count                     | For the number on the Chat link                                                                   |
| GET                | /chat/stream                           | Live events as `text/event-stream` (ADR 0009). Ids only, never text                               |
| GET, POST, DELETE  | /chat/blocks, /chat/blocks/{userId}    | The people the caller blocked                                                                     |
| GET, PUT           | /me/chat-settings                      | Who can write to me, read status, typing                                                          |
| GET                | /chat/report-categories                |                                                                                                   |
| POST               | /chat/reports                          | About a message or a person the caller has a conversation with                                    |

A conversation or message the caller has no part in answers 404, never 403, the same as one that never existed. A block answers a neutral 422 (`chatUndeliverable`) in both directions.

### Files

| Method | Path            | Notes                                                                                          |
| ------ | --------------- | ---------------------------------------------------------------------------------------------- |
| POST   | /files          | Multipart. Type allow-list, size limit per type, MIME sniffed. Admin roles only in demo (D15). |
| GET    | /files/{id}/url | Returns a short-lived signed URL after an access check                                         |

### Admin (`/admin/...`, requires an admin role **and** `mfa=true` in the session)

- `/admin/users` (list, detail, disable, enable, unlock, end sessions; roles are given with `POST /{id}/roles` and removed with `POST /{id}/roles/remove`, each with a reason)
- `/admin/roles` (the list of roles; they are fixed in code, so there is no route to change them or their permissions)
- `/admin/memberships` (create, renew, suspend, expire, CSV import with dry-run)
- `/admin/institutions` (hospitals, departments, assign directors)
- `/admin/news` (full CRUD, workflow transitions `POST /admin/news/{id}/transitions`)
- `/admin/events`, `/admin/events/{id}/sessions`, `/admin/speakers`, `/admin/events/{id}/attendance` (QR scan endpoint)
- `/admin/education`, `/admin/guidelines`
- `/admin/exam-questions` (write, review with `POST /{id}/transitions`, history)
- `/admin/broadcasts` (create, then `POST /{id}/approve` by a **different** admin)
- `/admin/chat/reports` (list, one report with the kept messages, `POST /{id}/resolve`) and `/admin/chat/suspensions` (list, suspend, `POST /{id}/lift`), with `chat.moderate`. There is no route for reading conversations, and each look at a report is audited
- `/admin/audit-logs` (read-only, filterable)
- `/admin/dashboard` (counts: pending approvals, members by status, upcoming events)
- `/admin/settings`

### Health

`GET /health/live`, `GET /health/ready` (not versioned)

## 5. Rate limits (initial)

| Scope                                     | Limit                                                       |
| ----------------------------------------- | ----------------------------------------------------------- |
| Global per IP                             | 300 requests/min                                            |
| `/auth/login`, `/auth/mfa/verify`         | 5/min per account + 20/min per IP, with exponential lockout |
| `/auth/register`, `/auth/password/forgot` | 5/hour per IP                                               |
| `/members` (directory)                    | 30/min per user                                             |
| `/search`                                 | 60/min per IP and per user; with members, also the directory limit |
| `/card/verify`                            | 60/min per IP                                               |
| Chat: sending messages                    | 30/min per user                                             |
| Chat: new conversations                   | 10/hour per user                                            |
| Chat: reports                             | 10/hour per user                                            |
| Chat: `/chat/people`, `/chat/search`      | 60/min per user                                             |
| Chat: "is typing"                         | 1 per 3 seconds per user (more are dropped, not refused)    |
| Chat: open event streams                  | 3 per user (a fourth closes the oldest)                     |

## 6. Client generation

`packages/api-client` is generated from the OpenAPI document (`openapi-typescript` + a small fetch wrapper). The web app never hand-writes request types. CI fails if the committed client is out of date with the spec.
