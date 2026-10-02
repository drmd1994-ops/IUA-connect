# IUA Connect — API Design

REST over HTTPS, JSON, base path **`/api/v1`**. OpenAPI 3.1 is generated from the NestJS decorators and Zod schemas. Swagger UI is at `/api/docs` in development and staging only.

## 1. Conventions

| Topic          | Convention                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource names | Plural, kebab-case: `/news`, `/events/{slug}/sessions`, `/verification-requests`                                                                                             |
| IDs in URLs    | Slugs for public content, UUIDs for everything else                                                                                                                          |
| Locale         | `Accept-Language: he` or `en`, or `?locale=`. Responses include `Content-Language`.                                                                                          |
| Pagination     | Cursor-based: `?limit=20&cursor=...` → `{ data: [...], page: { nextCursor, hasMore } }`. Admin tables may use `?page=&pageSize=` with a total count. Maximum `limit` is 100. |
| Filtering      | Explicit allow-listed query params (`?status=published&category=...`). No generic filter language.                                                                           |
| Sorting        | `?sort=-publishedAt,title` (allow-listed fields only)                                                                                                                        |
| Dates          | ISO 8601 UTC. Events also carry an IANA `timezone` (`Asia/Jerusalem`).                                                                                                       |
| Idempotency    | `Idempotency-Key` header supported on POSTs that create registrations, broadcasts and (later) payments                                                                       |
| Concurrency    | `ETag` / `If-Match` on editable content to prevent lost updates in the CMS                                                                                                   |
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
| GET         | /education · /education/{id}                       |
| GET         | /guidelines · /guidelines/{id}                     |
| GET         | /search?q=&types=news,events,...                   |

Access tiers are enforced on every read. Items the caller may not see are omitted from lists and return 404 on direct fetch.

### Notifications

`GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /notifications/unsubscribe` (public; the signed token from an email), `GET /broadcasts/{id}` (a sent message, for its recipients)

### Files

| Method | Path            | Notes                                                                                          |
| ------ | --------------- | ---------------------------------------------------------------------------------------------- |
| POST   | /files          | Multipart. Type allow-list, size limit per type, MIME sniffed. Admin roles only in demo (D15). |
| GET    | /files/{id}/url | Returns a short-lived signed URL after an access check                                         |

### Admin (`/admin/...`, requires an admin role **and** `mfa=true` in the session)

- `/admin/users` (list, detail, disable, unlock, roles)
- `/admin/roles`, `/admin/permissions` (super admin)
- `/admin/memberships` (create, renew, suspend, expire, CSV import with dry-run)
- `/admin/institutions` (hospitals, departments, assign directors)
- `/admin/news` (full CRUD, workflow transitions `POST /admin/news/{id}/transitions`)
- `/admin/events`, `/admin/events/{id}/sessions`, `/admin/speakers`, `/admin/events/{id}/attendance` (QR scan endpoint)
- `/admin/education`, `/admin/guidelines`
- `/admin/broadcasts` (create, then `POST /{id}/approve` by a **different** admin)
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

## 6. Client generation

`packages/api-client` is generated from the OpenAPI document (`openapi-typescript` + a small fetch wrapper). The web app never hand-writes request types. CI fails if the committed client is out of date with the spec.
