# M2 — People & membership: plan

- Status: **Proposed — awaiting owner approval** (no code is written before approval)
- Date: 2026-09-29
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M2. Design sources: `PRODUCT_REQUIREMENTS.md` §3.2–3.3, `ARCHITECTURE.md` §6–7 (authorization model, verification workflow), `DATABASE_DESIGN.md` §3 (people, institutions, membership, verification), `API_DESIGN.md` §4, spec §6–7 and §17 (subspecialties), ADR 0004. Owner decisions D2, D3, D9 and the answers to **O3** (2026-09-29).

## 1. Goal and exit criteria

A registered member fills in their professional profile and **applies for membership**. The application goes to their **department director**, then to an **IUA admin** for final approval. Approved members get a **digital membership card** with a QR code anyone can verify. Admins manage members, institutions and directors, and can import members from a CSV file.

**Exit criterion (roadmap):** an end-to-end test — register → director approves → admin approves → the card verifies. Plus the standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Owner answers to O3 (2026-09-29)

1. **Specialist certificate number:** digits only, no fixed length. Validation: 1–15 digits (the upper bound only stops junk input).
2. **Residents** give their **medical licence number** (digits only, 1–15).
3. **Students** are approved by an **IUA admin directly** — no department-director step.

Neither number is checked against a registry (there is no live check; D2/D3). Both are stored **encrypted** (AES-256-GCM, M1's field encryption) plus a keyed hash so the same number can't hold two active memberships, and are **never shown publicly** or logged.

## 3. Scope

**In M2**

1. **Reference data** (seeded, editable by admins later): the five membership types; the 11 subspecialties of spec §17 (he/en); Israeli hospitals with urology departments (real hospital names are acceptable per DATABASE_DESIGN §6; every person is fictional).
2. **Profiles** (spec §6): names (first, last, Hebrew, English), title, position, hospital and department, subspecialties, biography, research interests, ORCID, languages, professional contact details — each field with its own visibility: **Private (default) / Members / Public** (D9). The member directory itself is M7.
3. **Membership application** (ARCHITECTURE §7, D3): choose a membership type, hospital and department, and give the identifier the type needs → **director** approves or rejects (with a reason) → **IUA admin** gives final approval → the membership becomes **active** with start and end dates. Students skip the director. A department without a director goes straight to the admin queue, **flagged**. One open application at a time.
4. **Directors:** the department-director queue (only their own departments), decisions with reasons.
5. **Admin (in `/admin`, MFA required):** final-approval queue; members list with filters; create, renew, suspend, expire; payment status set by hand (D4: no payments); membership history (append-only); hospitals and departments; **assign and remove department directors**.
6. **CSV import with dry run** (D2, the IMA source-of-truth workflow): upload → a dry-run report (would create / update / skip, with reasons per row) → apply. Fictional data only.
7. **Digital membership card:** name, membership type, status, expiry and a QR code. The QR holds a **short-lived signed token** (5 minutes, no personal data); scanning opens a **public verification page** that shows only valid/invalid, the name and the membership type (PRODUCT_REQUIREMENTS §3.3).
8. **Emails** at each step (application received, approved by director, approved, rejected with the reason). In-app notifications come in M7.
9. **Demo seed layer** (DATABASE_DESIGN §6, layer 2): fictional members, directors and applications at every stage of the workflow.

**Not in M2**

| Item                        | Where                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| Profile photo               | M3 (needs the Files module: upload checks, EXIF stripping). Until then: initials. |
| Publications on the profile | Phase 2 (Publications module); M2 has no publications field                       |
| Member directory and search | M7                                                                                |
| In-app notifications        | M7                                                                                |
| Payments                    | Interface only (D4)                                                               |
| Live IMA integration        | Later, behind the `MembershipSource` interface (D2)                               |

## 4. Decisions with proposed defaults

- **Membership types:** FULL_MEMBER, NON_FULL_MEMBER, RESIDENT and STUDENT are self-applied; **HONORARY_MEMBER is granted by admins only**.
- **Identifiers per type:** FULL_MEMBER → specialist certificate number; RESIDENT and NON_FULL_MEMBER → medical licence number; STUDENT → none.
- **Membership period:** the calendar year (ends 31 December; §11). Renewal and expiry are manual admin actions in M2; "expired" is computed from the end date, never stored (DATABASE_DESIGN §1).
- **Directors:** a DEPARTMENT_DIRECTOR role scoped to one department (M1's scoped roles; MFA required). A director can't decide their own application; it goes to the admin queue, flagged.
- **Workflow states:** PENDING_DIRECTOR → PENDING_ADMIN → APPROVED, or REJECTED (with reason, at either stage), or WITHDRAWN by the applicant. Every transition is audited and writes membership history.
- **Card token:** signed with the API's EdDSA key under a separate key purpose ("card"), 5-minute lifetime, refreshed while the card is open. The verification page is rate-limited (60/min per IP, API_DESIGN §5) and never reveals the certificate or licence number.
- **Access:** members manage their own profile and application (`@Authenticated`); directors need `membership.approve.department` **and** a matching department scope (checked in a service policy); admins need `membership.approve.final` / `membership.manage` / `institutions.manage` (M1 catalogue). Every admin endpoint gets the 401/403/403/2xx test pattern (SECURITY_MODEL §5: anonymous, member, admin without MFA, admin).
- **Admin area:** `/admin` route group with its own layout (ADR 0006); the page checks for an admin role and an MFA session, and the API enforces the same.

## 5. Database (migrations)

New tables (DATABASE_DESIGN §3): `profiles`, `profile_field_visibility`, `profile_subspecialties`, `subspecialties` (+ he/en names), `hospitals`, `departments`, `membership_types`, `memberships` (type, status, dates, payment status, source MANUAL/IMPORT, encrypted identifier + hash), `membership_history` (append-only, like the audit log), `verification_requests`, `verification_decisions`, `import_batches` (dry-run reports). `user_roles.scope_id` gets its department foreign key (M1 left it open).

## 6. API (under `/api/v1`, API_DESIGN §4)

- Members: `GET/PATCH /me/profile` (with visibility), `GET /me/membership` (status and history), `POST /verification-requests`, `GET /verification-requests/mine`, `POST /verification-requests/{id}/withdraw`, `GET /me/membership/card-token`.
- Public: `GET /card/verify?t=`, `GET /hospitals`, `GET /hospitals/{id}/departments`, `GET /subspecialties`, `GET /membership-types`.
- Directors: `GET /verification-requests?stage=director`, `POST /verification-requests/{id}/decisions`.
- Admins: `GET /verification-requests?stage=admin`, decisions; `/admin/memberships` (list, create, renew, suspend, expire, payment status, history); `/admin/institutions` (hospitals, departments, directors); `/admin/memberships/import` (dry run, apply).

## 7. Web (he/en)

- **Member:** Profile (edit + per-field visibility), Membership (apply, status, history), Digital card (with QR), in the account menu.
- **Public:** `/card/verify` page (valid/invalid, name, type).
- **Director:** a "Pending applications" page for their departments.
- **Admin (`/admin`):** approval queue, members, member detail (history, actions), institutions and directors, CSV import (upload → dry-run report → apply).

## 8. Tests

- **Unit:** workflow state machine; identifier validation per type; director scope policy; card token (signing, expiry, tampering); CSV parsing and row validation.
- **Integration:** full workflow for each membership type (including students skipping the director and the no-director flag); a director can't see or decide another department's application or their own; identifiers stored encrypted and never returned; duplicate active identifier refused; admin actions and history; CSV dry run changes nothing, apply is idempotent; **every admin endpoint: anonymous 401, member 403, admin without MFA 403, admin 2xx**.
- **End to end (Playwright):** the exit test — register → verify email → apply → director approves → admin approves → open the card → the verification page shows "valid"; plus axe checks on every new page in he and en.

## 9. Order of work (a commit at each checkpoint; tests green at each)

1. Reference data and institutions (schema, seed, public lists, admin CRUD, director assignment).
2. Profiles with per-field visibility.
3. Membership application and the workflow (member, director, admin decisions; emails; history).
4. Admin membership management (list, create, renew, suspend, expire, payment status).
5. Digital card and public verification.
6. CSV import with dry run.
7. Web screens (member, director, admin).
8. Demo seed layer; Playwright exit test and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/membership`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

## 10. Risks

| Risk                                         | Mitigation                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Largest milestone so far                     | Eight checkpoints, each tested and committed; draft PR so CI runs early                         |
| Directors see applicants' personal data      | Only their own departments; identifiers never shown to directors (only "provided ✓"); audited   |
| Real hospital names next to fictional people | Every seeded person is fictional; the demo banner stays; names of real directors are never used |

## 11. Owner answers (2026-09-29)

1. **NON_FULL_MEMBER** gives a **medical licence number** (digits, 1–15), like residents, and goes through the director then the admin.
2. **Membership period: calendar year.** A membership ends on 31 December of the year it is approved or renewed; renewal is for the next calendar year.
3. **CSV import, people without an account:** the import **creates the account** (email treated as verified by the import) and sends a **"set your password" email**.
4. **Demo data:** M2 **seeds fictional demo people** (members, directors, admins, applications at every stage) with **one documented demo password**, development only; the seed refuses to run in production.
