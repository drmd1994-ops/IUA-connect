# M33: Voting and elections

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: After Phase 3. Size: XL, and the riskiest. Needs first: M32, M18, a legal opinion on electronic voting under the bylaws, and an outside review of the design before any code.

## 1. Goal

The association holds a vote or an election online that its members and its lawyers accept as valid: only eligible members vote, once, secretly where required, and the result can be checked.

**Why:** Specification §29: "Design voting as a separate security-sensitive service… Do not implement insecure voting logic."

## 2. Scope

**In**

- A design document first, reviewed by an outside expert, before any code is written.
- Eligibility fixed at a stated moment (the list is frozen and published to the committee).
- Strong sign-in to vote (two-step verification required).
- Secret ballots: the system cannot tell who cast which ballot, while still preventing a second vote.
- A receipt that lets a voter check their ballot was counted, without proving to anyone else how they voted.
- An election committee's controls: open, close, count, with more than one person required.
- A full record for audit, and a written procedure for disputes.

**Not in**

- Votes required by law to be on paper or in person.
- Anything built without the outside review.
- Building new cryptography: an established, reviewed scheme or an existing audited service is used.

## 3. Rules

- This is a separate service with its own database and keys; the rest of IUA Connect cannot read it.
- No administrator, and no developer, can see how a member voted or change a ballot.
- Nothing is counted before the vote closes.
- If the review says it cannot be done safely within the association's means, the answer is to use an existing audited voting service and link to it.

## 4. What is built

**Data:** Decided by the design; kept apart from the main database.

- Decided by the design. The first checkpoint may end with "buy, don't build".

## 5. New libraries, services and costs (each needs the owner's approval)

- To be decided with the reviewer: an audited open-source scheme (for example Helios or Belenios), or a commercial voting service.

## 6. Tests

- Decided by the design; at least: double voting, eligibility, a tampered ballot is detected, the count reproduces, a mock election with real members.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Legal opinion on what the bylaws allow
3. The design document; compare building with using an existing service
4. Outside review of the design
5. Only then: build or integrate
6. A mock election
7. Outside test
8. A first real, low-stakes vote

## 8. Risks

| Risk                                               | What is done about it                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A flawed election damages trust in the association | No code before review; a mock election; start with a low-stakes vote; the option not to build at all |
| Secrecy and checkability pull against each other   | That is why an established scheme is used, not invented here                                         |

## 9. Questions for the owner

1. Do the bylaws allow electronic voting today?
2. Is there budget for an outside expert's review?
3. Would an existing audited voting service be acceptable?

## 10. Owner answers

None yet.
