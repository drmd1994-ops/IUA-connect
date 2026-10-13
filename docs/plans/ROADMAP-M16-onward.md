# The remaining milestones: an overview

**Status: proposed. Nothing here is approved.** First written on 2026-10-07; rewritten on 2026-10-13 after the owner decided two things: **the product is built as independent of the association, with a section for it,** and **the build goes on without a server for now.** Each line below has its own plan file.

## 1. Where the project stands

- **Done and merged:** the site (M0 to M13) and the phone app with everything the site shows to members and visitors (M14, M15), with an Android .apk for the demo and automatic tests of its screens.
- **Built as the association's own product.** That is what changes first.
- **Still demo data only.** Nothing has had a legal review, an outside security test or a load test.

## 2. What the owner's decision changes

- **Two new milestones come first:** M16 makes the product stand by itself, with organisations as sections of it; M17 gives it its own way of knowing who is a physician.
- **The eighteen plans written on 2026-10-07 moved up by two numbers.** Each now opens with a short section saying what independence changes in it.
- **The hosted demo (now M18) is deferred.** Its host is not chosen.
- **What the association was to supply, the operator now supplies or does without:** the first users, the trust, the money, and the answer in law for people's data. The plans say where each of these bites; none of them is solved by code.
- **Governance and voting stay,** as features of an organisation's section.
- **The real association appears in the product only with its written agreement.** Until then its section is a fictional example.

## 3. The plans, in the order proposed

| #                                         | Milestone                                                              | Track                                                    | Size                  | Needs first                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [M16](M16-independent-platform.md)        | An independent platform, with a section for the association            | Independence                                             | XL                    | The owner's answers, above all the new name                                                                                  |
| [M17](M17-verification-and-onboarding.md) | Verifying physicians, and a new person's first steps                   | Independence                                             | L                     | M16                                                                                                                          |
| [M18](M18-hosted-demo.md)                 | The demo on a hosted service (Railway)                                 | Operate                                                  | M                     | a Railway account opened by the owner (Claude does not open accounts or enter payment details).                              |
| [M19](M19-production-foundations.md)      | Production foundations (the engineering half of the readiness gate)    | Readiness                                                | L                     | The association's decision to go ahead; M18 helps but is not required.                                                       |
| [M20](M20-readiness-gate.md)              | The readiness gate: reviews, outside tests, and the first real members | Readiness                                                | L (mostly not coding) | M19. People outside the project: a lawyer, a security tester, a screen-reader user, the association's office.                |
| [M21](M21-app-stores-push-offline.md)     | The app in the stores, push notifications, and limited offline use     | Operate                                                  | L                     | M20 for publishing (the stores ask for a privacy policy and a real service). Push and offline can be built before it.        |
| [M22](M22-cme.md)                         | CME: activities, credits and certificates                              | Phase 2                                                  | M                     | Nothing technical. A decision by the association on what counts as CME.                                                      |
| [M23](M23-question-bank.md)               | The full question bank                                                 | Phase 2                                                  | M                     | Questions. Today there are ten sample ones; a bank needs hundreds, written and reviewed by physicians.                       |
| [M24](M24-logbook-resident-hub.md)        | The surgical logbook and the resident hub                              | Phase 2                                                  | L                     | The legal review of M20 for real use (this is the most sensitive data so far). The MedOps file format, from the owner.       |
| [M25](M25-community.md)                   | Professional communities                                               | Phase 2                                                  | L                     | Nothing technical. A decision on how it differs from chat rooms, which exist.                                                |
| [M26](M26-case-discussions.md)            | Case discussions and the case of the week                              | Phase 2                                                  | L                     | M20's legal review before real use. Best after M25 (it reuses comments and moderation).                                      |
| [M27](M27-research-publications.md)       | Research collaboration and publications                                | Phase 2                                                  | M                     | Nothing technical.                                                                                                           |
| [M28](M28-jobs-mentorship.md)             | Jobs, fellowships and mentorship                                       | Phase 2                                                  | M                     | Nothing technical.                                                                                                           |
| [M29](M29-payments.md)                    | Payments: membership fees and event fees                               | Phase 2 (not in the roadmap's list; needed for real use) | L                     | M19 and M20. The association's bank or payment provider, and its accountant.                                                 |
| [M30](M30-clinical-calculators.md)        | Clinical calculators                                                   | Phase 3                                                  | M                     | A named physician to review every formula and interpretation.                                                                |
| [M31](M31-journal-club.md)                | Journal club                                                           | Phase 3                                                  | S to M                | M27 (publications) and M25 (comments) make it small. AI summaries need M33.                                                  |
| [M32](M32-conference-mode.md)             | Conference mode                                                        | Phase 3                                                  | M                     | M21's push notifications make reminders useful. A real conference to try it at.                                              |
| [M33](M33-ai-assistant.md)                | The AI assistant, with its safety rules                                | Phase 3                                                  | XL                    | M20 (legal review must cover it). Content to ground it in: guidelines, education, news, events. A budget for the AI service. |
| [M34](M34-governance.md)                  | Governance: bodies, meetings, documents and surveys                    | After Phase 3                                            | M                     | The association's bylaws, to model its bodies correctly.                                                                     |
| [M35](M35-voting.md)                      | Voting and elections                                                   | After Phase 3                                            | XL, and the riskiest  | M34, M20, a legal opinion on electronic voting under the bylaws, and an outside review of the design before any code.        |

Sizes are relative: S is like one chat milestone's smaller half, M like M12, L like M13 or M14, XL larger than anything so far.

## 4. What decides the order

- **M16 first:** every later feature has to know whether it is the platform's or an organisation's. Building more on the old shape means moving more later.
- **M17 next,** because without it nobody outside an organisation can be let in.
- **M18 (a server) when the owner takes it up again.** Until then the demo runs on this computer through the tunnel, as now.
- **M19 and M20 are the gate.** Nothing with real people's data happens before them. The operator signs, not the association, and most likely needs a legal entity first.
- **Features can be built before the gate, as demo features,** as chat and the app were. Real people use them only after it. The logbook and case discussions need the lawyer's word most of all.
- **The question bank and the journal club need people more than code.**
- **The AI assistant and voting can do real harm if done badly.** Each starts with a design and a review, not with code.

## 5. Decisions that cut across all of them

1. **Site and app together** for every new feature? Every plan assumes yes.
2. **Platform or organisation?** From M16 on, every feature states which it is. The notes at the top of each plan propose one.
3. **The patient-details check** is shared by the logbook, communities, cases and the AI assistant. It lowers the risk and cannot remove it.
4. **Not planned:** the admin area in the app, voice and video calls, chat between doctors and patients (the owner decided against them); the specification's "Phase 4" (registries, clinical data), which is a different kind of system.

## 6. What I recommend doing next

1. **M16,** once its questions are answered.
2. **A lawyer's hour, in parallel,** on who operates the product and on what was built so far for a pitch to the association. Not a matter for the code, and better early.
3. **M17.**
4. Then the features with the least risk and the most visible value for a physician who knows nobody on the platform yet: **calculators (M30)** and **the question bank (M23)**, if there are questions.

## 7. Questions for the owner

1. The questions of M16 (§9 there), above all the name.
2. Is the order of §6 right?
3. Should any plan be dropped?
