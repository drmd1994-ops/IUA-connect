# M27: Research collaboration and publications

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: M. Needs first: Nothing technical.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. A platform feature.

## 1. Goal

A member lists a study that seeks centres or collaborators, others find it and ask to join; a member's publications appear on their profile.

**Why:** Specification §18 and §19. The profile already has an ORCID field.

## 2. Scope

**In**

- A research project: title, lead investigator, institution, study type, description, status, ethics-approval status, funding, recruitment status, centres wanted, contact.
- Search and filters; "ask to join" with a message; the lead accepts or declines; a group chat for a project (reusing groups).
- Expertise on a profile, searchable.
- Publications on a profile: entered by hand, or fetched by PubMed identifier or DOI, or listed from ORCID with the member's consent.
- On the site and in the app.

**Not in**

- Holding study data, consent forms or anything about participants.
- Managing a study (tasks, documents).
- Research "matching" by algorithm (the specification puts it in Phase 3).

## 3. Rules

- A project listing holds no patient data and says so.
- Publications are fetched only from the public PubMed and ORCID services, within their terms, and say where they came from.
- Asking to join shares the asker's name and what they wrote, nothing else.

## 4. What is built

**Data:** `research_projects`, join requests, `publications`, profile expertise.

- Server: `research` and `publications` modules; connectors behind interfaces (as for video and push). Site and app: lists, a project, requests; publications on the profile.

## 5. New libraries, services and costs (each needs the owner's approval)

- No library needed for PubMed (a public web service); ORCID's public API. Both have usage limits.

## 6. Tests

- Connectors against recorded answers; a service being down leaves the page working.
- Join requests: who sees what.
- A wrong identifier gives a clear message.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Projects and search
3. Join requests and project groups
4. Publications by hand
5. PubMed and ORCID
6. App
7. Documents, status, demo

## 8. Risks

| Risk                                     | What is done about it                                              |
| ---------------------------------------- | ------------------------------------------------------------------ |
| The outside services change or limit use | Cached results; manual entry always works                          |
| Listings go stale                        | A yearly "is this still recruiting?" reminder; old ones are marked |

## 9. Questions for the owner

1. Who may list a project: any member, or with approval?
2. Is ethics-approval status self-declared? (Proposed: yes, labelled as such.)

## 10. Owner answers

None yet.
