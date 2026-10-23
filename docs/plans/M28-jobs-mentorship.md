# M28: Jobs, fellowships and mentorship

**Status: approved by the owner on 2026-10-23 with the answers in §10. Proposed on 2026-10-07; checked against the code and rewritten on 2026-10-23 (§0b).**

Track: Phase 2. Size: M to L (the app and the hosted demo are now part of every milestone). Needs first: nothing technical; the owner's answers in §9.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This is a platform feature. Organisations and hospital departments may post positions.

## 0b. What I checked on 2026-10-23

**What exists that this builds on:**

- **Hospitals and departments** (M2): a list of Israeli hospitals, each with departments. A **department director** is a role held for one department. Today it only approves membership applications.
- **Organisations** (M16) have their own staff, who already post news and events for their section.
- **Verification** (M17): the platform knows a person as a specialist, resident, physician or medical student, or not at all.
- **Profiles** (M2): hospital, department, subspecialties (the same 11 as everywhere), research interests and languages. Being listed in the member directory is the person's own choice and is off by default.
- **Review before publishing** (news, M3): draft, in review, published, with two people involved: the writer cannot publish their own item.
- **Chat** (M11): a private conversation can be started only with someone listed in the directory.
- **Notices** (M7) have one switch per kind, for the app and for email.
- **The app** (M14, M15, M18b) has every member screen; the admin area stays on the site. Email links open the app.

**What is missing:** everything in §2. There is nothing for positions or mentorship in the database, the server, the site or the app.

**One thing that has to change:** a mentor and a mentee may not be in the directory, so today they could not chat. An accepted mentorship request must open a conversation between the two even so (§3).

## 1. Goal

Hospitals, departments and organisations post jobs, fellowships and research posts that physicians can search. Experienced physicians offer mentorship, and residents and students ask for it.

**Why:** specification §24 and §25. Both have the same shape: a list, a search, a request. Both are useful to a new physician who doesn't know anyone on the platform yet.

## 2. Scope

**In**

- **A position** has:
  - its kind: job, fellowship or research post;
  - the institution: a hospital and department from the list, an organisation, or (if §9 question 2 allows) a named institution abroad;
  - the city and country, the subspecialties, and a title and description in Hebrew and English (one language is enough);
  - who it is for: specialists, residents, students, or anyone;
  - how to apply: a link or an email address, outside the platform;
  - a closing date.
- **Posting:** platform staff, an organisation's staff for their organisation, and a department director for their own department. Every position is reviewed by someone else before it shows (§9 question 1).
- **Who sees them:** everyone, visitors included (§10, answer 4). Saving a position needs a signed-in account.
- **Search:** by kind, subspecialty, institution, city or country, and who it is for. Results are sorted by closing date, nearest first.
- **Saving positions** to a person's own list.
- **A notice for new positions:** a new switch in the notification settings, "New positions", for the app and for email. Off by default for email.
- **Mentors:** a verified physician switches on "I'm open to mentoring" and fills in:
  - subspecialties, academic and career interests, and the languages they speak;
  - how much time they have (for example "one call a month");
  - how many mentees they can take at once.

  Their hospital and department are taken from their profile. They can switch it off at any time.

- **The mentor list:** searchable by subspecialty, interest, hospital and language.
- **Requests:**
  - A mentee writes a short request to a mentor. The mentor accepts or declines it.
  - Accepting opens a private conversation between the two, even if neither is listed in the directory.
  - Either side can end the mentorship later. The conversation then stays, as an ordinary one.
- **Notices** for a request, an acceptance and a decline, under a new kind, "Mentorship", on by default for the app and for email.
- **On the site and in the app,** in Hebrew and English: the positions, saved positions, the mentor list, the mentor switch and requests. Posting and reviewing positions stay on the site, like the rest of the admin area.
- **The email links** for both open the app (M18b's list grows).
- **Demo data:** fictional positions and mentors (§9 question 5).

**Not in**

- Applying through the platform, or keeping CVs.
- Paid listings.
- Matching by algorithm.
- Ratings or reviews of mentors.

## 3. Rules

- **A mentor is listed only by their own choice,** and can leave at any time. Leaving ends nothing that is already accepted.
- **The mentor list is seen by verified people only,** since only they may ask (§10, answer 3). Visitors see positions, not mentors.
- **A declined request is not explained,** and nobody else learns of it. Who asked whom is seen only by the two people.
- **Requests:**
  - A mentee has at most 3 requests waiting at a time, and cannot write to the same mentor again for 30 days after a decline.
  - A mentor at their limit of mentees is shown as "not taking mentees now" and can't be asked.
  - A request not answered in 30 days closes by itself, and the mentee is told.
- **Blocking applies** (M11): a person who blocked the other cannot be asked, or ask.
- **Positions:**
  - A position disappears from the list after its closing date.
  - A department director posts only for their own department, and an organisation's staff only for their organisation.
  - Staff see who posted a position and who reviewed it.
- **Staff never see** who saved a position, or who asked whom for mentorship.

## 4. What is built

**Data** (new tables only):

- `positions` and their translations, with their subspecialties and history;
- `saved_positions`;
- `mentor_profiles`;
- `mentorships`: the request and its states.

Plus two notification kinds (`POSITIONS`, `MENTORSHIP`) and two permissions:

- `positions.manage` (write);
- `positions.review` (publish).

Both are given to platform admins and organisation admins. Department directors get a scoped right to write for their department.

**Server:** a `positions` module (following the review pattern of news) and a `mentorship` module that asks chat to open a conversation when a request is accepted.

**Site:** Positions in the main menu (list, search, a position, saved positions); Mentorship (the mentor list, my mentor settings, my requests); the admin pages to write and review positions.

**App:** the same reading screens, the mentor switch and requests.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- **Positions:** a position shows only after someone other than its writer reviews it, and leaves the list after its closing date. A director can't post for another department, and an organisation can't post for another organisation. The search filters all work.
- **Mentorship:**
  - a mentor appears only after opting in, and disappears on opting out;
  - every state change of a request;
  - the limits of 3 waiting requests, 30 days after a decline, and the mentor's own limit;
  - blocking stops a request;
  - accepting opens a conversation between people not in the directory;
  - nobody but the two sees a request.
- **Notices:** the new kinds and their switches.
- **Browser tests** of positions and mentorship in both languages, with accessibility checks, and **app tests** of the new screens.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Positions with review, and the admin pages
3. Search, saving and the "New positions" notice
4. Mentor profiles and the mentor list
5. Requests, the conversation, the "Mentorship" notices
6. The app, and the email links that open it
7. Demo data
8. Documents, status, deploy to the hosted demo, a new .apk, the demo

## 8. Risks

| Risk                                                           | What is done about it                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Few listings make it look empty                                | Fictional demo positions for the pitch; for real use, positions gathered by the office before launch |
| A demo position at a real hospital looks like a real job offer | Every demo position says "Sample position, not a real offer" (§9 question 5)                         |
| Too many requests for a well-known mentor                      | The mentor's own limit, 3 waiting requests per mentee, and a 30-day wait after a decline             |
| A mentorship request is used to pester someone                 | Blocking, reporting through chat, and the limits above                                               |

## 9. Questions for the owner

My recommendation for each is the first answer.

1. **Who may post positions?** Platform staff, an organisation's staff for their organisation, and department directors for their own department, all reviewed by a second person before they show. (Or: staff only.)
2. **Positions abroad?** Yes: an institution abroad may be named as text, with its city and country, since fellowships are often abroad. (Or: Israel only.)
3. **Who may be a mentor, and who may ask?** Verified specialists may be mentors; any verified person (residents, students and specialists) may ask. (Or: any verified physician may mentor.)
4. **Who sees positions?** Any verified person, signed in. (Or: anyone, including visitors.)
5. **Demo data:** about 12 fictional positions at the hospitals in the list, each marked "Sample position, not a real offer", and 6 fictional mentors among the demo people. (Or: invented hospital names.)
6. **The numbers:** 3 waiting requests per mentee, 30 days before asking the same mentor again, 30 days before an unanswered request closes. Keep or change?

## 10. Owner answers

Given on 2026-10-23, when the owner said "build M28" and answered the questions:

1. **Posting:** platform staff, an organisation's staff for their organisation, and department directors for their own department, each position reviewed by a second person before it shows.
2. **Abroad:** yes; an institution abroad is named as text, with its city and country.
3. **Mentors:** verified specialists may mentor; any verified person may ask.
4. **Who sees positions:** everyone, visitors included (not my recommendation, which was verified people only). The site and the app show them without signing in; saving one needs an account.
5. **Demo data:** about 12 fictional positions at hospitals from the list, each marked "Sample position, not a real offer", and 6 fictional mentors among the demo people.
6. **The numbers:** kept: 3 waiting requests per mentee, 30 days before asking the same mentor again after a decline, 30 days before an unanswered request closes.
