# M20: The readiness gate: reviews, outside tests, and the first real members

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Readiness. Size: L (mostly not coding). Needs first: M19. People outside the project: a lawyer, a security tester, a screen-reader user, the association's office.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. The operator signs the gate, and most likely needs a legal entity first. Added to the list: an agreement with each organisation that has a section, saying who answers for its members' data. "How real members come in" becomes: people sign up and are verified (M17); the association's members reach its section through their membership there.

## 1. Goal

Real members can use IUA Connect: every item of the readiness checklist in `DEPLOYMENT.md` is done, by a named person, on a date.

**Why:** Nothing built so far has been reviewed by a lawyer, attacked by an outside tester, or loaded with many users. The project's rule is that no real data enters before that.

## 2. Scope

**In**

- Legal and privacy review by a professional: terms of use, privacy notice, the directory consent, the security levels, files and video in chat, retention and deletion. Claude prepares the material; the lawyer decides; Claude makes the changes.
- An accessibility coordinator named on the statement, and a check by someone who uses a screen reader every day, on the site and the app.
- A named reviewer for medical content (education, exam questions).
- A penetration test by an outside tester; every finding fixed or accepted in writing.
- A load test, and the page-speed work in `docs/demo/PERFORMANCE.md`.
- Administrators set up their own two-step verification; demo accounts do not exist in production.
- How real members come in (applications, the CSV import, or the Medical Association's list), decided and tried on a copy first.
- A deletion and export path for a member's own data, as the review requires.

**Not in**

- New features. Anything the reviews ask for that is a feature gets its own plan.

## 3. Rules

- A checklist item is done when a named person says so in writing; Claude's opinion does not close one.
- Findings are recorded as they were given, including the ones not fixed.

## 4. What is built

**Data:** What the legal review requires (for example consent records with versions, retention periods).

- Whatever the reviews turn up. Experience says: texts, consent screens, retention jobs, some hardening.
- The import of real members, run first as a dry run that writes nothing.

## 5. New libraries, services and costs (each needs the owner's approval)

- A load-testing tool (k6 or similar). The outside tester brings their own.

## 6. Tests

- The load test's scenarios kept in the repository and re-runnable.
- A regression test for every penetration-test finding that is fixed.

## 7. Order of work (a commit at each step; tests green at each)

1. This plan approved; the people named.
2. Material for the lawyer; the legal review; the changes.
3. Accessibility check and medical-content review; the changes.
4. Load test and performance work.
5. Penetration test; fixes; retest.
6. Import dry run on a copy; go-live checklist signed; first real members.

## 8. Risks

| Risk                                                                            | What is done about it                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| The legal review forbids something already built (files in chat, the directory) | Each such feature can be switched off by configuration; the plan lists them for the lawyer first |
| Outside people take weeks to schedule                                           | They are contacted at checkpoint 1; the coding items run in parallel                             |
| The first import brings wrong data about real people                            | Dry run on a copy; the association's office checks a sample by hand                              |

## 9. Questions for the owner

1. Who is the lawyer, the security tester, the accessibility coordinator, the medical-content reviewer?
2. Which way do real members come in?
3. Who at the association signs the go-live?

## 10. Owner answers

None yet.
