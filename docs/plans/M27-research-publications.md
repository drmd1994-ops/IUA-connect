# M27: Research collaboration and publications

**Status: approved by the owner on 2026-10-24 with the answers in §10. Proposed on 2026-10-07; checked against the code and rewritten on 2026-10-24 (§0b).**

Track: Phase 2. Size: M to L (site, app, hosted demo). Needs first: the owner's answers in §9, including the use of two outside services.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). A platform feature.

## 0b. What I checked on 2026-10-24

**What exists that this builds on:**

- **Profiles** (M2) already have "research interests" (free text) and an **ORCID iD** (checked for its form), each with its own visibility (private, members, everyone). The member directory (M7) shows them to members when the person chose so.
- **Verification** (M17): specialist, resident, physician, student.
- **Chat groups** (M13): up to 50 people, made by members, by invitation. An accepted mentorship (M28) already opens a private conversation from outside chat; a project's group can be opened the same way.
- **Communities** (M25) and their patient-details check, which blocks an ID number, a phone number, a full date and the like. It can check a project's text too.
- **Notices** (M7) with a switch per kind; the app (M14 to M25) with every member screen.

**What is missing:** everything in §2. Nothing in the code talks to PubMed or ORCID yet; both are free public web services with usage limits, and using them needs the owner's approval (§5, §9 question 3).

## 1. Goal

A physician lists a study that seeks centres or collaborators; others find it and ask to join. A physician's publications appear on their profile, typed in or fetched by their identifier.

**Why:** specification §18 and §19.

## 2. Scope

**In**

- **A research project:** title; the lead investigator (the person who lists it) and their institution; study type (prospective, retrospective, trial, registry, survey, other); subspecialties; description; status (planning, recruiting, ongoing, completed); ethics approval (self-declared: approved, submitted, not yet, not needed; labelled as declared by the lead); funding (free text); recruitment status; what is wanted (centres, co-investigators, a statistician, residents, students); how to reach the lead.
- **Search and filters:** by words, subspecialty, study type, what is wanted, and status.
- **Asking to join** with a short message; the lead accepts or declines (no reason given). Accepting adds the person to the **project's chat group**, which is opened for the project with the lead in it (§9 question 4). The lead can close the project to new requests, or end it.
- **Expertise:** the profile's "research interests" field becomes searchable in the member directory (with the same visibility as now).
- **Publications on a profile:** title, authors, journal, year, DOI, PubMed ID, a link, and topics.
  - typed in by hand; or
  - fetched by a PubMed ID or a DOI from PubMed; or
  - listed from the person's ORCID record and chosen from it (§9 question 3).

  Each says where it came from. A person orders and hides their own; they show on the profile with the same visibility as research interests.

- **Notices:** a request to your project, and the answer to yours; one new kind, "Research", with its switch.
- **The patient-details check** on a project's title and description.
- **On the site and in the app.** Fetching from PubMed and ORCID on both.
- **Demo data:** fictional projects and hand-typed fictional publications (§9 question 5).

**Not in**

- Holding study data, consent forms or anything about participants.
- Managing a study (tasks, documents, budgets).
- Matching researchers by algorithm (Phase 3).
- Importing whole publication lists automatically, without the person choosing.

## 3. Rules

- **A project listing holds no patient data,** and says so; the patient-details check blocks its text as in communities.
- **Ethics approval is declared by the lead,** and shown as declared, never as verified.
- **Asking to join shares the asker's name, their mark (student, resident), their hospital, and what they wrote,** nothing else.
- **Limits:** 5 open projects per lead; 5 waiting requests per person; 30 days before asking the same project again after a decline; a request unanswered in 30 days closes by itself (as in mentorship).
- **A project not updated for a year** is marked "may be out of date", and its lead is asked once whether it is still recruiting.
- **Publications** come from the person themselves; fetching from PubMed or ORCID only fills the form, which the person then saves. Nothing is fetched about anyone else.
- **Outside services:** only their public interfaces, within their terms (PubMed: at most 3 requests a second without a key; ORCID: the public API). When a service is down or slow (5 seconds), the page says so and typing by hand still works.

## 4. What is built

**Data:** `research_projects` (with subspecialties and what is wanted), `research_requests`, `publications`; the project's chat group by its id.

**Server:** a `research` module; a `publications` module with two connectors behind interfaces (`PublicationLookup`: PubMed; `OrcidWorks`: ORCID), each with a stand-in for tests and development, like the video and push connection points. Directory search extended to research interests.

**Site:** Research in the main menu (projects, a project, my projects and requests, listing a project); publications on the profile page (add by hand, by PubMed ID or DOI, from ORCID) and on a member's directory page.

**App:** the same.

## 5. New libraries, services and costs (each needs the owner's approval)

- **No new library:** both services are called with the server's own web requests.
- **Two outside services, free and without an account:** PubMed's E-utilities (the US National Library of Medicine) and ORCID's public API. The server sends them only the identifier a person typed (a PubMed ID, a DOI or an ORCID iD), never anything else.

## 6. Tests

- Projects: who may list; the limits; search and filters; the patient-details check.
- Requests: who sees what; accepting adds to the group; declining says nothing; expiry; blocking.
- Publications: by hand; the connectors against recorded answers; a wrong identifier gives a clear message; a service down leaves the form working; nothing is saved by a lookup alone.
- The directory finds people by research interests, only as their visibility allows.
- Browser tests in both languages with accessibility checks; app tests of the new screens.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Projects, search and the patient-details check
3. Requests, the project group, notices
4. Publications by hand; expertise in the directory
5. PubMed and ORCID
6. The site, then the app
7. Demo data, documents, status, deploy, a new .apk, the demo

## 8. Risks

| Risk                                     | What is done about it                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| An outside service changes or limits use | A timeout, a clear message, and typing by hand always works             |
| Listings go stale                        | The yearly question to the lead, and the "may be out of date" mark      |
| Patient data in a project's description  | The patient-details check, the standing note, reports as in communities |
| Ethics approval taken as verified        | Always labelled "declared by the lead"                                  |

## 9. Questions for the owner

My recommendation for each is the first answer.

1. **Who may list a project:** any verified physician (residents included); students may ask to join. Or: verified specialists only; or: with staff approval first.
2. **Who sees the projects:** verified people only. Or: everyone, visitors too.
3. **PubMed and ORCID:** use both free public services, to fill a publication from its PubMed ID or DOI, and to list a person's works from their ORCID record. Or: typing by hand only.
4. **The project's group:** accepting a request adds the person to a chat group for the project. Or: no group; the lead and the person talk privately.
5. **Demo data:** about 6 fictional projects, and a few hand-typed fictional publications for the demo people, with no real PubMed IDs or DOIs, so no fictional person is tied to a real paper. Or: no demo publications.

## 10. Owner answers

Given on 2026-10-24, when the owner said "start M27" and chose my recommendation for each question:

1. **Any verified physician** lists a project, residents included; medical students ask to join.
2. **Verified people only** see the projects.
3. **PubMed and ORCID** are used, to fill a publication from its PubMed ID or DOI and to list a person's works from their ORCID record. Only the identifier the person types is sent.
4. **Accepting a request adds the person to the project's chat group.**
5. **Demo data:** about 6 fictional projects and a few hand-typed fictional publications, with no real PubMed IDs or DOIs.
