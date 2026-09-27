# IUA Connect — Product Requirements (MVP)

The source specification is the master prompt: 62 sections, kept in `docs/product/MASTER_SPEC.md`. This document narrows it to the **MVP** and records the owner's decisions (see PROJECT_STATUS.md, D1–D15).

## 1. Goal of the MVP

A convincing, working, secure **web** platform to pitch to the IUA. It shows:

- a Hebrew-first, bilingual professional home for Israeli urology
- verified membership with a department-director approval chain
- IUA news, events and educational content, managed through an admin portal
- a foundation clearly built to grow: mobile, CME, community, AI

Demo data only. No real personal data is loaded until legal review is complete (spec §59).

## 2. Users in the MVP

| Actor                               | Can                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitor (guest)                     | Browse public news, events, education and guidelines links. Register.                                                                                         |
| Registered, pending                 | Edit own profile. See their verification status.                                                                                                              |
| Active member (any membership type) | Everything a visitor can, plus: the dashboard, personal event registrations and schedule, a digital card, opting into the directory, notification preferences |
| Department director                 | Approve or reject pending registrants for their department(s)                                                                                                 |
| Content editor                      | Create and edit news and education content, and submit it for review                                                                                          |
| Event admin                         | Manage events, sessions, speakers, registrations and attendance                                                                                               |
| IUA admin                           | Final approval of members, manage memberships, publish content, manage users and roles, view the audit log                                                    |
| Super admin                         | System settings, role/permission matrix, directors                                                                                                            |

## 3. MVP features and acceptance criteria

### 3.1 Authentication (spec §5)

- Register with email and password. Email verification is required before the verification workflow starts.
- Argon2id hashing, a password policy (length plus a breached-password check against a local list), password reset with single-use expiring tokens.
- TOTP MFA: optional for members, **mandatory for any admin or director role**. Recovery codes are included.
- Passkeys (WebAuthn): planned for **M1b**. Biometric login on mobile arrives with the Expo app.
- Sessions: listed per device, individually revocable, and "log out everywhere".
- Refresh-token rotation with reuse detection. Reuse revokes the whole token family.
- Lockout and backoff after failed attempts. Suspicious-login email for a new device or location.

### 3.2 Profiles (spec §6)

- All fields in spec §6. Hebrew and English name are separate fields.
- Each field has its own visibility: `PRIVATE` / `MEMBERS` / `PUBLIC`, defaulting to PRIVATE.
- The directory listing is **opt-in** (D9). Search only returns opted-in members, only to logged-in active members, and is rate-limited.

### 3.3 Membership and verification (spec §7, D2–D3)

- Membership types, statuses, start and expiration dates, history (append-only), and a payment-status field (manually set, D4).
- The verification workflow is described in ARCHITECTURE §7.
- Specialist certificate number: required for specialist membership types. It's format-validated, stored encrypted at the field level, and never shown publicly.
- **Digital card:** name, membership type, status, expiry, and a QR code. The QR holds a **short-lived signed token** (no personal data), and scanning it opens a verification page showing only valid/invalid, the name and the type.
- An admin screen for manual create, renew, suspend and expire. Imports come from CSV (the IMA source-of-truth workflow).

### 3.4 Dashboard (spec §8)

MVP sections: News, Upcoming events, Educational content, Notifications, Quick actions.

Quick actions that point at Phase 2/3 features (Create Case, Post Research, Ask Community, Open Calculator) are shown as **"Coming soon"**, disabled and clearly labelled, so they aren't mistaken for working features (spec §60).

### 3.5 News (spec §9)

- All fields in spec §9. Workflow: draft → review → scheduled → published → archived.
- Translations per locale. A missing translation falls back to the default locale, with a visible notice.
- The scheduled-publish job runs through pg-boss.
- Imported items keep `source_url` and the original date and show a "Source: IUA website" attribution.

### 3.6 Events (spec §10, core only)

- Events, sessions and speakers. Registration (internal, or an external `registration_url`). A personal schedule.
- ICS calendar export per event and for the personal schedule.
- QR attendance: an event admin scans the member's card or session QR, and attendance is recorded. This data is ready for CME in Phase 2.
- Email reminders now; push later.
- **Not in the MVP:** full conference mode (live polls, audience Q&A). The "Now / Next" view is a stretch goal.

### 3.7 Education (spec §12)

- All content types, metadata and levels. PDF, article, presentation and external-link delivery.
- Video: the item can exist with an **external URL** or be marked "video pending". Upload and hosting are held until D8 is decided.
- An access tier on every item, defaulting to PUBLIC (D7).

### 3.8 Guidelines (spec §14, minimal in the MVP)

- Metadata plus the official link only (source, date, version, status, evidence level).
- No reproduction of third-party guideline documents.

### 3.9 Notifications (spec §27)

- In-app and email. Categories as in the spec. Per-category, per-channel preferences.

### 3.10 Search (spec §32)

- Global search over news, events, education, guidelines and (opted-in) members.
- Hebrew-aware: normalized text (niqqud stripped, final letters folded) with `simple` config plus trigram fallback.

### 3.11 Admin portal (spec §34, MVP scope)

Users, roles, **approval queue**, memberships, institutions and directors, news, events, education, guidelines, notifications (broadcast), audit log viewer, settings.

- A broadcast notification to all members requires **approval by a second admin**.

## 4. Non-functional requirements

| Area            | Requirement                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Accessibility   | WCAG 2.2 AA target and Israeli IS 5568. Keyboard navigation, screen readers, RTL tested with NVDA.                  |
| Performance     | Largest Contentful Paint under 2.5 s on 4G for public pages. Every list paginated. Images optimized.                |
| Localization    | No hard-coded strings. RTL and LTR visually tested.                                                                 |
| Security        | See SECURITY_MODEL.md                                                                                               |
| Reliability     | Predictable error envelopes. Loading, empty, error and retry states on every screen.                                |
| Maintainability | Module boundaries enforced by lint (`eslint-plugin-boundaries`). Test coverage above 80% for services and policies. |

## 5. Explicitly out of the MVP

Mobile app · payments (interface only) · video hosting (interface only) · CME certificates · community · cases · messaging · research · publications · jobs · mentorship · logbook · question bank · AI · calculators · governance / voting · IMA integration.

## 6. Definition of done

Spec §62 applies to every feature. A feature isn't done because its screen exists.
