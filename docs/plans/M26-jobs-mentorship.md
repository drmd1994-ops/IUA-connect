# M26: Jobs, fellowships and mentorship

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: M. Needs first: Nothing technical.

## 1. Goal

Institutions post positions members can search; members offer and seek mentorship.

**Why:** Specification §24 and §25. Both are small and share one shape: a listing, a search, a request.

## 2. Scope

**In**

- A position: job, fellowship or research post; institution, place, subspecialty, description, how to apply, closing date. Posted by staff or by a department director; reviewed before it shows.
- Search by place, subspecialty, institution and kind; a notice for new positions, with a switch.
- Mentorship: a member opts in as a mentor (subspecialty, interests, availability); a mentee sends a request; the mentor accepts or declines; accepting opens a private conversation.
- On the site and in the app.

**Not in**

- Applying through the platform or holding CVs.
- Paid listings.
- Matching by algorithm.

## 3. Rules

- A mentor is listed only by their own choice and can leave at any time.
- A declined request is not explained and the mentee is not listed anywhere.
- A position expires on its closing date.

## 4. What is built

**Data:** `positions`, `mentor_profiles`, `mentorship_requests`.

- Server: `positions` and `mentorship` modules, using the review pattern of news. Site and app: lists, a position, the mentor list, requests.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Review before showing; expiry; who may post.
- Mentor opt-in and opt-out; request states; no leak of who asked whom.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Positions with review
3. Search and notices
4. Mentor profiles
5. Requests
6. App
7. Documents, status, demo

## 8. Risks

| Risk                            | What is done about it                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Few listings make it look empty | Launched with real listings gathered by the office, or not shown until there are some |

## 9. Questions for the owner

1. Who may post positions?
2. May positions outside Israel be listed?
3. Who may be a mentor (any specialist, or approved ones)?

## 10. Owner answers

None yet.
