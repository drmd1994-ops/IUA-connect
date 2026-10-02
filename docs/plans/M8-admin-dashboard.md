# M8 — Admin portal completion and dashboards: plan

- Status: **Approved by the owner on 2026-10-02**
- Date: 2026-10-02
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M8. Design sources:
  - `PRODUCT_REQUIREMENTS.md` §3.4 (dashboard), §3.11 (admin portal)
  - `API_DESIGN.md` §4 (`/admin/users`, `/admin/roles`, `/admin/audit-logs`, `/admin/dashboard`, `/admin/settings`)
  - `SECURITY_MODEL.md` (audit log, admin account takeover)
  - Spec §8 (home dashboard), §34 (admin portal)

## 1. Goal and exit criteria

An administrator opens the admin area on a dashboard that shows what is waiting for them, manages accounts and roles, reads the audit log and changes the few site settings. A signed-in member lands on a personal dashboard instead of the public home page.

**Exit criteria (roadmap):**

- Every admin route passes the test pattern: anonymous 401, member 403, admin without two-step verification 403, admin 2xx.
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. Scope

**In M8**

1. **Admin dashboard (`/admin`)**
   - Tiles with numbers and links, each shown only to people who may act on it:
     - Membership applications waiting (for a director, for the association).
     - Members by status (active, suspended, expired) and by membership type.
     - Waiting for review: news, education items, exam questions.
     - Messages to members waiting for approval.
     - Events in the next 30 days, with how many registered.
   - The numbers are counted when the page opens. No charts and no history in this milestone.
2. **Accounts (`/admin/users`)**
   - A list with search by email or name and filters by state and role.
   - An account page: email, state, whether the address is verified, roles, whether two-step verification is set up, the last sign-in, the number of open sessions, and the membership (a link to the members screen).
   - Actions:
     - Disable and enable an account. A disabled account can't sign in and its sessions end at once.
     - Unlock an account that was locked after failed sign-ins.
     - End all sessions of an account.
   - Rules: nobody disables their own account; every action needs a reason and is audited.
   - Not shown and not changeable: passwords, two-step secrets, recovery codes.
3. **Roles (inside the account page)**
   - Grant and remove roles: super admins only (§11.1).
   - Rules: nobody changes their own roles; the last super admin can't be removed; a role with a scope (department director) is still assigned from the hospitals screen, as today.
   - A read-only table of what each role may do (`/admin/users/roles`).
4. **Audit log viewer (`/admin/audit`)**
   - A read-only list, newest first, with filters: what was done, who did it, on what, and a date range.
   - Each line: when, who, what, on what, the address it came from, and the recorded details (already stored without secrets).
   - Opening the audit log is itself audited.
5. **Settings (`/admin/settings`)** (§11.2)
   - The association's contact details (email, phone, address in Hebrew and English), shown in the footer of every page.
   - A notice banner: a short message in Hebrew and English at the top of every page, switched on and off.
6. **Member dashboard**
   - After sign-in the home page becomes a personal dashboard (§11.3):
     - **My membership:** state and end date, or a link to apply.
     - **Notifications:** the newest unread notices.
     - **Upcoming events:** the next events, with the ones the member registered for first.
     - **News** and **Education:** the newest items the member may read.
     - **Quick actions** that work: find a colleague, browse guidelines, practise exam questions, my membership card.
     - **Quick actions for later** (create a case, post research, ask the community, open a calculator): shown as "Coming soon", disabled and clearly labelled.
   - Visitors keep the public home page.
7. **The admin route sweep (exit criterion):** one test goes over every admin route the API declares and checks the three refusals for each, so a route added later can't be forgotten. The existing per-module tests stay.
8. **Demo seed:** a super admin account for the demo (`super@demo.test`), contact details and a sample notice.

**Not in M8**

| Item                                                        | Where                                 |
| ----------------------------------------------------------- | ------------------------------------- |
| Analytics, charts, trends over time                         | After the pitch                       |
| Payments, CME, cases, research, community, jobs, AI modules | Phase 2 and 3 (not built)             |
| Creating new roles or changing what a role may do           | Not planned (roles are fixed in code) |
| Deleting accounts and data export requests                  | The real-data readiness gate          |
| Impersonating a member ("sign in as")                       | Not planned                           |
| Editing or deleting audit entries                           | Never (append-only)                   |

## 3. Roles and rules (proposed defaults)

- **Dashboard:** anyone with an admin permission; each tile needs the permission of the screen it links to.
- **Accounts:** reading needs `users.read`; disabling, enabling, unlocking and ending sessions need `users.manage` (IUA admins and super admins).
- **Roles:** `roles.manage` (super admins only).
- **Audit log:** `audit.read` (IUA admins and super admins).
- **Settings:** `settings.manage` (super admins only).
- All of these apply only in a session that completed two-step verification, as everywhere in the admin area.
- **Privacy in the accounts screen:** it shows account facts, not profile fields a member keeps private. The members screen already shows what admins need about memberships.

## 4. Database (migrations)

- `settings` (a key, a value, who changed it and when), with the allowed keys fixed in code.
- Indexes for the audit filters, if the existing ones don't cover them.
- No change to accounts or roles tables is expected: disabling uses the existing account state.

## 5. API (under `/api/v1`)

- `GET /admin/dashboard`.
- `GET /admin/users`, `GET /admin/users/{id}`, `POST /admin/users/{id}/disable`, `/enable`, `/unlock`, `/sessions/revoke`.
- `GET /admin/roles` (the roles and what each may do), `POST /admin/users/{id}/roles`, `DELETE /admin/users/{id}/roles/{role}`.
- `GET /admin/audit-logs`.
- `GET` and `PUT /admin/settings`; `GET /settings/public` for the values pages need.
- `GET /me/dashboard`.

## 6. Tests

- **Unit:** the role rules (own roles, last super admin, scoped roles); which tiles a person sees; settings validation.
- **Integration:** every new route with the access pattern; disabling ends sessions and blocks sign-in, enabling restores it; unlock; role changes take effect on the next request and are audited; the audit filters; the audit log can't be changed through the API; the dashboard numbers match the data for a known set; the member dashboard follows the access tiers.
- **The sweep:** every admin route, three refusals each.
- **End to end (Playwright):** an admin opens the dashboard and follows a tile to the waiting item; disables an account, which then can't sign in, and finds the action in the audit log; a member signs in and sees their dashboard with a "Coming soon" action that can't be used. Axe checks on every new page in he and en.

## 7. Order of work (a commit at each checkpoint; tests green at each)

1. Accounts API (list, page, disable, enable, unlock, end sessions).
2. Roles API and rules.
3. Audit log API; the admin route sweep.
4. Admin dashboard API; settings; member dashboard API.
5. Web: admin dashboard, accounts, roles, audit log, settings.
6. Web: the member dashboard. Demo seed; end-to-end tests and accessibility; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/admin-dashboard`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

No new libraries are planned.

## 8. Risks

| Risk                                               | Mitigation                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| An admin locks everyone out                        | Nobody disables themselves or changes their own roles; the last super admin can't be removed |
| A taken-over admin account gives itself more power | Role changes need `roles.manage`, a session with two-step verification, and are audited      |
| The audit log leaks personal data                  | It shows what is already stored redacted; reading it needs `audit.read` and is audited       |
| Dashboard numbers that mislead                     | Each number links to the list it counts, with the same filter                                |
| "Coming soon" taken for working features           | Disabled, labelled, and not links                                                            |
| An admin route added later without protection      | The sweep test covers every declared admin route                                             |

## 9. Questions for the owner

Asked on 2026-10-02; answers in §11.

## 10. Checkpoint test

After M8 the owner tests the demo: the admin dashboard and its tiles, disabling a demo account, the audit log, and the member dashboard.

## 11. Owner answers (2026-10-02)

1. **Roles:** **super admins only** give and remove roles. The demo gets a super admin account (`super@demo.test`).
2. **Settings:** **the association's contact details in the footer**, and **a notice banner** (a short message at the top of every page, in Hebrew and English, switched on and off). Opening and closing sign-ups was not chosen.
3. **Member dashboard:** **the home page after sign-in.** Visitors keep the public home page.
