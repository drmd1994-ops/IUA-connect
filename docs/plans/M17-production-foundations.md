# M17: Production foundations (the engineering half of the readiness gate)

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Readiness. Size: L. Needs first: The association's decision to go ahead; M16 helps but is not required.

## 1. Goal

Every stand-in the demo uses is replaced by something fit for real members' data, and the server refuses to start in production without them.

**Why:** `DEPLOYMENT.md` lists 13 items before real data. Items 5 to 9 and 12 are engineering; this milestone is those. The rest (legal, outside tests) is M18.

## 2. Scope

**In**

- File storage in a real object store (S3-compatible), including storing a file from disk and serving a part of one, which chat video needs.
- Email through a real sending service, with bounce handling and the unsubscribe that already exists.
- A malware scanner in front of every upload (ClamAV or a service); chat video is scanned too, or refused.
- Rate limits kept in the database or a shared store, so they hold across more than one server process.
- Secrets from a secret manager, not from files; key rotation written down and tried once.
- Managed PostgreSQL: the two roles as in development, backups, point-in-time recovery, and a restore actually done.
- Monitoring and alerts: errors, sign-in attacks, failed jobs, disk and database; log retention; an incident plan.
- Production start-up checks: no demo adapter, no "dev-" key, no demo account, HTTPS only.

**Not in**

- Legal and privacy review, the outside security test, the load test (M18).
- Payments (M27), push notifications (M19).

## 3. Rules

- A file is never served before it was scanned.
- No secret is ever written to a log, a file in the repository, or an error message.
- Every production adapter passes the same test suite as its demo twin (one contract, two implementations).

## 4. What is built

**Data:** A table for rate-limit counters if the database is chosen as the store. Files gain a "scan state".

- Server: the adapters behind the interfaces that already exist (`ObjectStorage`, `Mailer`, `MalwareScanner`, rate-limit store), and the start-up checks.
- Infrastructure written as files in the repository (so it can be rebuilt), and runbooks: deploy, roll back, restore, rotate keys, incident.
- Site and app: nothing visible changes.

## 5. New libraries, services and costs (each needs the owner's approval)

- An S3 client library; an object store (provider chosen with hosting).
- An email service (for example Amazon SES, Postmark or an Israeli provider) and its library.
- ClamAV, or a scanning service.
- A monitoring service (errors and uptime).
- Costs depend on the host chosen in question 1; an estimate is part of checkpoint 2.

## 6. Tests

- Contract tests run against both the demo and the production adapter of each kind.
- A file with a test virus signature is refused; a clean one passes.
- A restore drill: the database is restored to a new instance and the suites run against it.
- The server refuses to start in production with any demo setting.

## 7. Order of work (a commit at each step; tests green at each)

1. This plan approved, with the hosting and provider choices.
2. An estimate of monthly cost; infrastructure as files; an empty production-like environment.
3. Object storage and the malware scanner.
4. Email sending.
5. Rate-limit store; secrets; start-up checks.
6. Database: roles, backups, the restore drill.
7. Monitoring, alerts, the incident plan; runbooks.
8. Documents, status, demo on the production-like environment with fictional data.

## 8. Risks

| Risk                                                   | What is done about it                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Choosing providers before the association chose a host | Everything sits behind the existing interfaces; a provider can be swapped without touching the features |
| Scanning large videos is slow or costly                | Decide in the plan: scan, cap the size, or switch chat video off for real use                           |
| A restore that was never tried does not work           | The drill is an exit criterion, not a document                                                          |

## 9. Questions for the owner

1. Who hosts it, under whose name, and where (the checklist asks for an Israeli region)?
2. Which email service; from which address does the association send?
3. Chat video for real members: scanned, limited, or off?
4. What monthly budget is acceptable?

## 10. Owner answers

None yet.
