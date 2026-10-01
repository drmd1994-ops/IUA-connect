# M5 — Events: plan

- Status: **Approved by the owner on 2026-10-01**
- Date: 2026-10-01
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M5. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.6 (events, core only)
  - `DATABASE_DESIGN.md` §3 (events, sessions, speakers, registrations, attendance)
  - `API_DESIGN.md` §4 (public and admin event routes)
  - Spec §10 (events); §11 (conference mode) is **not** in the MVP
  - Owner decisions D7 (access tiers), D11 and the M4 plan §11.1 (the imported conference page loads here)

## 1. Goal and exit criteria

Members find the association's events, register, build a personal schedule from the sessions, add it to their calendar, and have their attendance recorded. Event admins create events with sessions and speakers, see who registered and who attended.

**Exit criteria (roadmap):**

- Registration tests.
- Attendance tests.
- ICS (calendar file) tests.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M5**

1. **Events**
   - Every spec §10 field: title, description, start and end, location name and address, map coordinates, organiser, category, image, registration link, "CME available" flag.
   - Hebrew and English text with the Hebrew fallback, as for news.
   - An access tier per event (public, members, chosen membership types), default public (D7).
   - States: **draft → published → cancelled**. A cancelled event stays visible, marked as cancelled, and its registrants are emailed.
   - Times are entered in Israel time and stored in UTC, with the time zone kept on the event.
2. **Sessions and speakers**
   - Sessions: title, description, room, start and end, speakers. Hebrew and English.
   - Speakers: name, title, affiliation, short biography (he/en), optional photo. A speaker is a record, not an account.
   - Session materials (spec §10): files attached through the M3 files module.
3. **Registration**
   - Three modes per event: **in the app**, **external link** (the event shows a link to another site), or **none**.
   - In-app: register and cancel; an optional capacity with a **waiting list** (§11); registration closes when the event starts.
   - One registration per person per event.
4. **Personal schedule**
   - A registered member picks sessions. "My schedule" lists them by day, and flags sessions that overlap.
5. **Calendar export (ICS)**
   - One file per event (public events need no sign-in) and one for the member's own schedule.
   - Written by hand to the iCalendar standard; no new library.
6. **Attendance**
   - Recorded per event or per session. The event admin shows a QR code at the venue; a member scans it with their own phone, signs in and confirms. The code is signed and changes every few minutes, so a photo of it can't be reused later. Admins can also mark people by hand (§11).
   - An event admin sees the attendance list and can export it as CSV.
   - The data is kept ready for CME points in Phase 2; no points are calculated now.
7. **Email reminders**
   - To registered members 7 days and 1 day before the event (§11), through the job queue. Each reminder is sent once.
   - In-app and push notifications come later (M7 and the mobile app).
8. **Admin (`/admin/events`)**
   - For the EVENT_ADMIN and IUA admin roles (`events.manage`, MFA required): events, sessions, speakers, registrations, attendance.
   - "Events" joins the admin navigation for people who hold that permission.
9. **Web (he/en)**
   - Public: `/events` (upcoming and past), `/events/[slug]` (details, sessions by day, speakers, map link, register).
   - Member: register and cancel, pick sessions, `/account/schedule`, calendar download.
   - The home page's "Events" card becomes a link.
10. **Imported conference page** (M4): the one public conference page in the fixtures is loaded as a published event with its title and source link. Its dates aren't on the page, so see §4.
11. **Demo seed:** fictional events (one upcoming with sessions and fictional speakers, one full, one past with attendance, one cancelled) and an event-admin demo account.

**Not in M5**

| Item                                             | Where                                   |
| ------------------------------------------------ | --------------------------------------- |
| Conference mode (live polls, audience questions) | Not in the MVP (spec §11)               |
| "Now / Next" view                                | Stretch goal, not planned for M5        |
| CME points and certificates                      | Phase 2 (attendance data is kept ready) |
| Abstract submission                              | Phase 2                                 |
| Payments for events                              | Not in the MVP (D4)                     |
| Push and in-app reminders                        | M7 and the mobile app                   |
| Search over events                               | M7 (M5 builds the search columns)       |
| Speaker pages linked to member profiles          | M7 member directory                     |

## 3. Roles and rules (proposed defaults)

- **Managing events:** `events.manage` (EVENT_ADMIN and IUA_ADMIN, as seeded). No second reviewer: an event admin publishes directly. News keeps its four-eyes rule; events are simpler by design.
- **Seeing events:** the access tier decides, exactly as for news. A hidden event is left out of lists and answers "not found" by link.
- **Registering:** needs a signed-in, verified account that may see the event (§11).
- **Waiting list:** when the event is full, registering joins the list in order of arrival. A cancellation promotes the first person waiting, in the same transaction, and emails them. People on the list aren't counted as registered, pick no sessions and get no reminders.
- **Capacity:** counted on registration, inside one database transaction, so two people can't take the last place.
- **Cancelling a registration:** allowed until the event starts. It frees the place.
- **Editing a published event:** allowed. Changing the date, time or place emails the registrants.
- **Deleting:** only a draft with no registrations. Anything else is cancelled, not deleted.
- **Attendance records** are append-only: a wrong entry is voided with a reason, never erased.

## 4. The imported conference page

The fixture holds only a title ("הכנס השנתי באילת") and its address on the IUA website: the page shows no dates. An event needs a start and an end. Proposed: load it as a **draft**, not published, with the source link, so an event admin fills in the dates and publishes it. Nothing is invented. (Part of what you approve with this plan.)

## 5. Database (migrations)

New tables (DATABASE_DESIGN §3): `events`, `event_translations`, `event_categories`, `event_sessions`, `event_session_translations`, `speakers`, `speaker_translations`, `session_speakers`, `session_materials`, `event_registrations`, `schedule_items` (the member's chosen sessions), `event_attendance`, `event_reminders` (what was sent, so nothing is sent twice).

- Checks: end after start; sessions inside their event's time span; capacity positive; an external link required in external mode.
- `event_attendance` is append-only (database trigger, like the membership history).
- Hebrew-normalised search columns on event and session text.
- `content_access_rules` gains the `event` entity (no schema change).

## 6. API (under `/api/v1`)

- **Public (tier-filtered):** `GET /events` (upcoming or past, category filter, paged), `GET /events/{slug}`, `GET /events/{slug}/sessions`, `GET /events/{slug}.ics`.
- **Member:** `POST` and `DELETE /events/{slug}/registration`; `PUT /events/{slug}/schedule` (chosen sessions); `GET /me/schedule` and `GET /me/schedule.ics`; `POST /events/{slug}/check-in` with the scanned code.
- **Admin (`events.manage`):** `/admin/events` (list, create, get, update with `If-Match`, publish, cancel), `/admin/events/{id}/sessions`, `/admin/speakers`, `/admin/events/{id}/registrations`, `/admin/events/{id}/attendance` (list, record, void, CSV).
- Every admin route gets the anonymous 401 / member 403 / admin-without-MFA 403 / admin 2xx tests.

## 7. Tests

- **Unit:** the ICS writer (escaping, line folding at 75 bytes, UTC times, Hebrew text, stable IDs); the event state rules; capacity and overlap logic; reminder timing; Israel-time conversion.
- **Integration:**
  - **Registration:** register, cancel, the waiting list and its promotion in order, twice is refused, closed after the start, external and "none" modes refuse in-app registration, tiers respected, the last place can't be taken twice (two requests at once).
  - **Attendance:** a scanned code checks the member in, an expired or altered code is refused, recorded once per person per session, only for people who may attend, voiding keeps the record, the CSV export, append-only at the database level.
  - **ICS:** the event file and the personal schedule file parse as valid calendars with the right times.
  - Reminders are sent once; a cancelled event emails registrants; date changes email registrants.
  - The admin access pattern on every admin route.
- **End to end (Playwright):** an event admin creates and publishes an event with two sessions; a member registers, picks a session, downloads the calendar file, and is marked as attended; the admin sees the attendance. Axe checks on every new page in he and en.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. Schema; events, categories and translations; admin API; public list and detail under tiers.
2. Sessions, speakers and materials.
3. Registration, capacity and the personal schedule.
4. ICS export.
5. Attendance.
6. Reminders and change emails (job queue).
7. Web: public pages, member registration and schedule, admin screens.
8. Imported conference page; demo seed; end-to-end test and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/events`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

Working practice, from M3 and M4: after each push I check the CI result on GitHub before going on, and long test runs are split so they finish inside the time limit.

## 9. Questions for the owner

1. **Who may register** for an event in the app.
2. **When an event is full.**
3. **How attendance is recorded.**
4. **When reminders are sent.**

Answers are recorded in §11.

## 10. Risks

| Risk                                               | Mitigation                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Two people taking the last place                   | The count and the insert run in one transaction with a lock on the event; tested with parallel requests |
| Time zones and daylight saving                     | Stored in UTC with the zone kept; the ICS file uses UTC times; tests cover both seasons                 |
| Calendar files that some apps reject               | Written to the standard and checked by parsing them back in tests                                       |
| Reminder emails sent twice or after a cancellation | A sent-log per registration and reminder; the job re-checks the event's state before sending            |
| Attendance tampering                               | Signed, short-lived QR tokens; append-only records; every manual entry names who recorded it            |
| Real people as speakers in demo data               | Fictional speakers only; the imported page brings no people                                             |

## 11. Owner answers (2026-10-01)

1. **Who may register:** anyone signed in with a verified account who may see the event. To limit an event to members, its access level is set to "members only", which also hides it from others.
2. **Full events:** a **waiting list**. When a registered person cancels, the first person waiting gets the place automatically and is emailed.
3. **Attendance:** members **scan a QR code shown at the venue** (for the event or a session) with their own phone and confirm in the app. Event admins can also mark people by hand. No camera library is added.
4. **Reminders:** two emails, **7 days before and 1 day before** the event starts.
