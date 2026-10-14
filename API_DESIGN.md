# Med Connect — API Design

> **Since M16 (2026-10-13)** the product is **Med Connect**, an independent platform with a section for each organisation ([decision 0010](docs/adr/0010-a-platform-with-organisations.md)). Where this document still says "the association" or "IUA admin", read "an organisation" and "its administrator"; the section "M16" below is what holds now.

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

### Chat rooms (M12; active members, and staff with `chat.moderate`)

| Method           | Path                                             | Notes                                                                                                   |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| GET              | /chat/rooms                                      | The open rooms. `q`, `categoryId`, `cursor`. Each says whether the caller is in it                      |
| GET              | /chat/rooms/mine                                 | The rooms the caller is in, newest activity first, with unread counts                                   |
| GET              | /chat/room-categories                            |                                                                                                         |
| GET              | /chat/rooms/{id}                                 | The room, the caller's place in it, and whether they can write and why not                              |
| POST             | /chat/rooms/{id}/join, /leave                    | Joining needs an active membership, a first and last name, and no ban                                   |
| PATCH            | /chat/rooms/{id}/me                              | Mute, mark as unread                                                                                    |
| GET              | /chat/rooms/{id}/members                         | The people in the room, for people in it and staff. `q` for mentions                                    |
| GET, POST        | /chat/rooms/{id}/messages                        | As in a conversation. Sending takes `mentions` and, from a moderator, `announcement`                    |
| POST             | /chat/rooms/{id}/read, /typing                   |                                                                                                         |
| PUT, DELETE      | /chat/messages/{id}/reactions/{reaction}         | One of six fixed reactions. Rooms and private conversations                                             |
| GET              | /chat/rooms/{id}/pins                            |                                                                                                         |
| POST, DELETE     | /chat/rooms/{id}/pins/{messageId}                | Moderators. Five pins a room                                                                            |
| DELETE           | /chat/rooms/{id}/messages/{messageId}            | Moderators: the message shows "removed by a moderator"                                                  |
| POST             | /chat/rooms/{id}/lock, /unlock                   | Moderators. With `minutes`, until then                                                                  |
| POST             | /chat/rooms/{id}/members/{userId}/remove         | Moderators, with a reason. The person may join again                                                    |
| GET, POST        | /chat/rooms/{id}/bans, /bans/{banId}/lift        | Moderators, with a reason; for days, or until lifted                                                    |

Editing, deleting and hiding one's own message, search, the stream, blocks and reports are the M11 routes; `POST /chat/reports` also takes a `roomId` (a room as such).

**Who gets what:** a room that doesn't exist, or a caller who may not see rooms at all, answers 404. An active member who is not in a listed room gets its details, and 403 (`chatRoomNotJoined`) for its messages, members and pins. A person in the room who is not a moderator gets 403 for a moderation route; a moderator of another room gets 404 if not in this one. Staff with `chat.moderate` read any room and act as its moderator without joining; they write only if they joined it as a member.

### Chat groups, invitations, activity, forwarding and files (M13)

| Method      | Path                                                       | Notes                                                                                                 |
| ----------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST        | /chat/groups                                               | Makes a group and invites `userIds`. Nobody is in it until they accept. Needs an active membership    |
| GET, PATCH  | /chat/groups/{id}                                          | The group as one of its people sees it; the admin renames it                                          |
| PATCH       | /chat/groups/{id}/me                                       | Mute, archive, pin, mark as unread                                                                    |
| POST        | /chat/groups/{id}/leave                                    | When the admin leaves, the longest-standing person runs the group                                     |
| GET         | /chat/groups/{id}/members                                  | Everyone in it (50 at most). `q` for mentions                                                         |
| POST        | /chat/groups/{id}/members/{userId}/remove, /admin          | The admin removes a person, or hands the group over                                                   |
| GET, POST   | /chat/groups/{id}/messages, /read, /typing                 | As in a room, without announcements                                                                   |
| GET, POST   | /chat/groups/{id}/invitations, /chat/rooms/{id}/invitations | A group's admin; in a room by invitation, its moderators and staff                                    |
| GET         | /chat/invitable?q=&conversationId=                         | Who the caller may invite                                                                             |
| GET         | /chat/invitations                                          | The caller's own invitations that wait for an answer                                                  |
| POST        | /chat/invitations/{id}/accept, /decline                    |                                                                                                       |
| DELETE      | /chat/invitations/{id}                                     | Takes one back: whoever may invite there                                                              |
| GET         | /chat/activity?userIds=                                    | `online`, `today`, `week` or `earlier`, only for people the caller talks with who show it             |
| POST        | /chat/messages/{id}/forward                                | A copy of the text and files to a conversation, group or room the caller can write in                 |
| POST        | /chat/attachments                                          | Multipart, written to disk as it arrives. JPEG, PNG, PDF (10 MB) or MP4 (100 MB)                      |

Also since M13: sending a message takes `attachmentIds` (three at most, one video at most, each the caller's own unused upload), and the text may then be empty; a message carries `forwarded` and `attachments`; `GET …/messages` takes `around`; `GET /chat/search` takes `senderId`, `from`, `to`; the three `/me` routes take `pinned` (five pinned conversations a person); `/me/chat-settings` has `invitesFrom` and `showActivity`; the admin room input has `inviteOnly`; `GET /files/{id}/content` answers a `Range` request with 206.

**Who gets what:** a group answers 404 to anyone who is not in it, staff included, on every route, the same as an invented id. A room by invitation answers 404 to a member who is not in it, invited or not, and is left out of the list and the search. Someone who can't be invited answers 404, like someone who doesn't exist. A file of a message is given (`GET /files/{id}/url`) only to someone who can read that message.

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
- `/admin/chat/reports` (list, one report with the kept messages, `POST /{id}/resolve`) and `/admin/chat/suspensions` (list, suspend, `POST /{id}/lift`), with `chat.moderate`. There is no route for reading conversations, and each look at a report is audited. A report about a room or a room message can also be resolved with `archiveRoom` (needs `chat.rooms.manage`)
- `/admin/chat/rooms` (list, create, read, `PUT`, `POST /{id}/archive`, `POST /{id}/restore`, `POST /{id}/moderators`, `POST /{id}/moderators/{userId}/remove`), `/admin/chat/room-categories` (list, create, `PUT`, `DELETE` while no room uses it) and `/admin/chat/report-categories` (list, create, `PUT`; switched off, never deleted), with `chat.rooms.manage` (M12)
- `/admin/audit-logs` (read-only, filterable)
- `/admin/dashboard` (counts: pending approvals, members by status, upcoming events)
- `/admin/settings`

### Health

`GET /health/live`, `GET /health/ready` (not versioned)

### Verification and invitations (M17)

| Method | Path                                           | Notes                                                                                   |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | /me/verification                               | Where the person stands, what they are verified as and until when, their latest request |
| POST   | /me/verification                               | Ask (or renew, or answer a refusal). Numbers are accepted and never returned            |
| POST   | /me/verification/withdraw                      | Take the waiting request back                                                           |
| POST   | /me/verification/document                      | A student's confirmation (PDF, JPEG, PNG; 10 MB), named in the request                  |
| GET    | /medical-schools                               | Public                                                                                  |
| GET    | /physician-verifications?state=                | Reviewers (`physicians.verify`). Never the reviewer's own                               |
| GET    | /physician-verifications/{id}                  | With the person's earlier requests                                                      |
| GET    | /physician-verifications/{id}/document         | A five-minute link to the confirmation; audited                                         |
| POST   | /physician-verifications/{id}/decisions        | Approve with what the register shows (and the typed number), or refuse with a reason    |
| POST   | /physician-verifications/people/{userId}/revoke | End a verification, with a reason                                                      |
| GET    | /me/invitations                                | Counts only: sent, joined, left today                                                   |
| POST   | /me/invitations                                | Invite an address. Always 202                                                           |

- **`/me`** answers `verifiedAs`; a person in the directory and in chat carries `mark` (`STUDENT`, `RESIDENT` or null).

### Organisations (M16)

| Method | Path                               | Notes                                                                       |
| ------ | ---------------------------------- | --------------------------------------------------------------------------- |
| GET    | /organisations                     | Public. Who has a section: name, address name, description. Never members.  |
| GET    | /organisations/{slugOrId}          | Public.                                                                     |
| GET    | /me/memberships                    | The person's memberships, one per organisation.                             |
| GET    | /me/membership?organisation=       | One of them. The organisation may be left out while it can only mean one.   |
| GET    | /membership-types?organisation=    | Each type says whose it is.                                                 |
| GET    | /news, /events ?organisation=      | Narrowed to one organisation. Every item carries `organisation` (or null). |
| GET    | /chat/rooms?organisation=          | Narrowed to one organisation's rooms. Narrowing never opens a room.         |
| GET    | /broadcasts/{id}                   | The message says who sent it: `organisation`, or null for the platform.     |

- **Staff routes** take `organisationId` when a new item is made by someone who works in more than one place (`organisationRequired` when it is left out, `unknownOrganisation` when it is not theirs), and `?organisation=` to narrow a list. An item's owner does not change (`ownerCannotChange`).
- **Roles** are granted with `organisationId` (or null for the platform); `roleWrongPlace` when the role cannot be held there.
- **`/me`** answers `verified`, `platformPermissions`, and `organisations[]` with the permissions held in each.
- **Another owner's thing answers 404**, never 403, on every staff route.

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
