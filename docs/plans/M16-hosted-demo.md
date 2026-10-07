# M16: The demo on a hosted machine

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Operate. Size: M. Needs first: Nothing. Can start now.

## 1. Goal

The demo works with the owner's computer switched off: the site, the server and the app reach one hosted machine at a proper web address with a security certificate.

**Why:** Today the demo needs this computer on, three windows open, and a GitHub sign-in for the tunnel most days. A fixed web address also unlocks what the app could not have: passkeys, and email links that open the app.

## 2. Scope

**In**

- One hosted Linux machine running what this computer runs: the server, the site, PostgreSQL, and the files on its disk. Still demo mode, still fictional people.
- A web address (a domain or a free sub-domain) with a certificate that renews by itself.
- A written, repeatable way to put a new version on it, and to wipe and re-seed the demo data.
- The .apk rebuilt with the new address, with its own icon and name screen.
- Passkeys in the app, and links from emails (verify address, new password) opening the app. Both need the address.
- The tunnel stays as the fallback and is documented as such.

**Not in**

- Real members' data (that is M17 and M18).
- Hosting in Israel under the association's name: this machine is the demo's, wherever it is cheapest.
- Sending real email: the demo keeps writing emails to its outbox, shown on a demo-only page.

## 3. Rules

- The machine holds demo data only. A banner says so on every page, as now.
- Nobody signs in to it with a real password: the demo accounts and the shared demo password are the only accounts, and the password is changed from the one in the repository.
- The machine is reachable only on the web ports; its database is not reachable from outside.

## 4. What is built

**Data:** No change to the database.

- Server: a start-up for a hosted demo (demo adapters allowed, but with the hosted address). Nothing in the rules of the API changes.
- Site: its server address comes from configuration, as now.
- App: universal links, passkeys (a library, see below), the icon.
- A deployment script and a runbook in `DEPLOYMENT.md`.

## 5. New libraries, services and costs (each needs the owner's approval)

- A hosting account (owner's decision: Oracle's free machine with its catches, or about $5 a month).
- A domain name, about $10 to $15 a year, or a free sub-domain.
- `react-native-passkey` or Expo's equivalent, for passkeys in the app.
- Caddy or nginx on the machine, for the certificate.

## 6. Tests

- The existing suites, unchanged.
- A smoke check after each deployment: the site answers, sign-in works, a live chat message arrives.
- Passkey sign-in in the app, by hand on the owner's phone.

## 7. Order of work (a commit at each step; tests green at each)

1. This plan approved, with the hosting choice.
2. The machine, the address, the certificate; the server and site running with seeded demo data.
3. The deployment script and the runbook; the smoke check.
4. The app: the address, the icon, a rebuilt .apk.
5. Email links that open the app; passkeys in the app.
6. Documents, status, demo.

## 8. Risks

| Risk                                                  | What is done about it                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A free machine is taken back for being idle           | Said in the plan's choice; the runbook rebuilds the demo from nothing in one sitting                     |
| A demo on the open internet attracts sign-in attempts | Rate limits and lockout already exist; the demo password is not the published one; the data is fictional |
| Passkeys in the app prove harder than on the web      | They are the last step; the milestone is useful without them                                             |

## 9. Questions for the owner

1. Which host: Oracle free, or a paid small machine (about $5 a month)?
2. A domain name: buy one (which name?), or a free sub-domain for now?
3. Who else gets the demo's address and accounts?

## 10. Owner answers

None yet.
