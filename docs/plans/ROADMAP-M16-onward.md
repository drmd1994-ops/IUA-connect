# The remaining milestones: an overview

**Status: proposed on 2026-10-07. Nothing here is approved.** Written at the owner's request. Each line below has its own plan file; this page puts them in order and says what they depend on.

## 1. Where the project stands

- **Done and merged:** the site (M0 to M13) and the phone app with everything the site shows to members and visitors (M14, M15), with an Android .apk for the demo.
- **Still demo data only.** Nothing has had a legal review, an outside security test or a load test.
- **The roadmap's order after the MVP:** the readiness gate → the app → Phase 2 → Phase 3 → governance and voting. The app was built ahead of the gate, as a demo, at the owner's request.

## 2. The plans, in the order proposed

| #                                     | Milestone                                                              | Track                                                    | Size                  | Needs first                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [M16](M16-hosted-demo.md)             | The demo on a hosted service (Railway; rewritten 2026-10-07)           | Operate                                                  | M                     | A Railway account opened by the owner.                                                                                       |
| [M17](M17-production-foundations.md)  | Production foundations (the engineering half of the readiness gate)    | Readiness                                                | L                     | The association's decision to go ahead; M16 helps but is not required.                                                       |
| [M18](M18-readiness-gate.md)          | The readiness gate: reviews, outside tests, and the first real members | Readiness                                                | L (mostly not coding) | M17. People outside the project: a lawyer, a security tester, a screen-reader user, the association's office.                |
| [M19](M19-app-stores-push-offline.md) | The app in the stores, push notifications, and limited offline use     | Operate                                                  | L                     | M18 for publishing (the stores ask for a privacy policy and a real service). Push and offline can be built before it.        |
| [M20](M20-cme.md)                     | CME: activities, credits and certificates                              | Phase 2                                                  | M                     | Nothing technical. A decision by the association on what counts as CME.                                                      |
| [M21](M21-question-bank.md)           | The full question bank                                                 | Phase 2                                                  | M                     | Questions. Today there are ten sample ones; a bank needs hundreds, written and reviewed by physicians.                       |
| [M22](M22-logbook-resident-hub.md)    | The surgical logbook and the resident hub                              | Phase 2                                                  | L                     | The legal review of M18 for real use (this is the most sensitive data so far). The MedOps file format, from the owner.       |
| [M23](M23-community.md)               | Professional communities                                               | Phase 2                                                  | L                     | Nothing technical. A decision on how it differs from chat rooms, which exist.                                                |
| [M24](M24-case-discussions.md)        | Case discussions and the case of the week                              | Phase 2                                                  | L                     | M18's legal review before real use. Best after M23 (it reuses comments and moderation).                                      |
| [M25](M25-research-publications.md)   | Research collaboration and publications                                | Phase 2                                                  | M                     | Nothing technical.                                                                                                           |
| [M26](M26-jobs-mentorship.md)         | Jobs, fellowships and mentorship                                       | Phase 2                                                  | M                     | Nothing technical.                                                                                                           |
| [M27](M27-payments.md)                | Payments: membership fees and event fees                               | Phase 2 (not in the roadmap's list; needed for real use) | L                     | M17 and M18. The association's bank or payment provider, and its accountant.                                                 |
| [M28](M28-clinical-calculators.md)    | Clinical calculators                                                   | Phase 3                                                  | M                     | A named physician to review every formula and interpretation.                                                                |
| [M29](M29-journal-club.md)            | Journal club                                                           | Phase 3                                                  | S to M                | M25 (publications) and M23 (comments) make it small. AI summaries need M31.                                                  |
| [M30](M30-conference-mode.md)         | Conference mode                                                        | Phase 3                                                  | M                     | M19's push notifications make reminders useful. A real conference to try it at.                                              |
| [M31](M31-ai-assistant.md)            | The AI assistant, with its safety rules                                | Phase 3                                                  | XL                    | M18 (legal review must cover it). Content to ground it in: guidelines, education, news, events. A budget for the AI service. |
| [M32](M32-governance.md)              | Governance: bodies, meetings, documents and surveys                    | After Phase 3                                            | M                     | The association's bylaws, to model its bodies correctly.                                                                     |
| [M33](M33-voting.md)                  | Voting and elections                                                   | After Phase 3                                            | XL, and the riskiest  | M32, M18, a legal opinion on electronic voting under the bylaws, and an outside review of the design before any code.        |

Sizes are relative: S is like one chat milestone's smaller half, M like M12, L like M13 or M14, XL larger than anything so far.

## 3. What decides the order

- **M16 can start now** and makes the demo independent of this computer.
- **M17 and M18 are the gate.** Nothing with real members' data happens before them. They wait for the association's decision and for people outside the project.
- **Phase 2 features can be built before the gate, as demo features,** exactly as chat and the app were. They can be _used by real members_ only after it. The ones that touch patient-adjacent content (M22 logbook, M24 cases) need the lawyer's word before real use even more than the rest.
- **M21 and M29 need people more than code** (questions to be written, an editor for the journal club). They are not worth building without them.
- **M31 (AI) and M33 (voting) are the two that can do real harm if done badly.** Each starts with a design and a review, not with code; M33 may end with "use an existing service".

## 4. Decisions that cut across all of them

1. **Site and app together?** Since M15 the app shows what the site shows to members. Every plan here says "on the site and in the app". That roughly adds a third to each. The alternative is site first, app later.
2. **The patient-details check.** The importer already refuses results that look like personal data. Several plans (M22, M23, M24, M31) extend it into one shared check that warns before saving. It lowers the risk; it cannot remove it, and each plan says so.
3. **Phase 4 of the specification** (national registries, multicentre research, institutional integrations, clinical data infrastructure) has no plan here. It is a different kind of system, with medical-record obligations, and the specification itself says it would need "a separate security/compliance architecture".
4. **Not planned because the owner decided against them:** the admin area in the app; voice and video calls; chat between doctors and patients.
5. **Analytics** (specification §35) has no milestone of its own: each feature adds its own privacy-conscious counts to the admin dashboard.

## 5. What I recommend doing next

1. **M16** now: small, removes the daily friction, and unlocks passkeys and email links in the app.
2. **Pitch to the association.** Their answer decides whether M17 and M18 start, and who the outside people are.
3. While that is pending, the Phase 2 features with the least risk and the most visible value: **M20 (CME)** and **M28 (calculators)**, the latter already promised on the member's dashboard as "Coming soon".
4. Everything else in the table's order, each after its own questions are answered.

## 6. Questions for the owner

1. Is the order of §5 right, or is something more urgent?
2. Site and app together for every new feature (§4, point 1)?
3. Which of the plans, if any, should be dropped?
