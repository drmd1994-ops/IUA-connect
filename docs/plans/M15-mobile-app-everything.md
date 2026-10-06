# M15: the mobile app, part 2 — everything the site shows

**Status: approved by the owner on 2026-10-05, without the admin area (answers in §9).**

Asked for by the owner on 2026-10-05: "i want everything that the web app shows to show in the mobile app". The plan for part 1 (`M14-mobile-app.md` §3) left most of the site out of the app on purpose. This plan brings the rest in.

## 1. What I checked before writing this

I listed every page of the site (77 of them, 36 in the admin area) and marked what the app already has.

- **In the app today (M14):** sign-in, Home, the membership card, news, events with registration and "my schedule", notifications and their switches, chat, chat settings, language, the fingerprint lock. **Almost none of it has been tried on a phone yet** (`docs/demo/MOBILE_CHECKLIST.md`).
- **Not in the app:** everything in §2.
- **How big this is.** The site's code for what is missing is about twice the size of everything the app has today. More than half of that is the admin area. This is the largest piece of work in the project so far.
- **No change to the server is needed.** The app would use the requests the site already uses. The API decides who may see and do what, exactly as for the site, so a member who opens the app never sees an admin screen.

## 2. Scope: what would be added

**A. For every member**

| Area on the site                         | In the app                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Education library                        | The list with the site's filters; an item with its text, files and references                            |
| Exam practice and "my results"           | One question at a time, checked and remembered by the server, as on the site                             |
| Guidelines                               | The list with its filters; a guideline with its link to the publisher                                    |
| Member directory                         | Search and filters; a member's page; "write to this member" opens chat                                   |
| Search                                   | One search over news, events, education, guidelines and members; a result opens inside the app           |
| My profile                               | View and edit, with the photo and who may see each field                                                 |
| My membership                            | Its state and history; what the site shows about renewing                                                |
| Account security                         | Change password; the authenticator (set up, recovery codes, switch off); my sessions, and ending one     |
| A broadcast message from the association | Opens in the app from its notice                                                                         |
| Attendance at an event                   | Scanning the venue's code inside the app (needs the camera library, §4)                                  |
| Calendar files                           | "Add to my calendar" for every event and for "my schedule" (needs the file libraries, §4)                |
| The accessibility statement              | Shown in the app                                                                                         |
| Chat: what part 1 left on the site       | Searching messages and jumping to one; "active now"; invitations still waiting; inviting to a room; copy |

**B. For someone who is not a member yet**

| Area on the site                          | In the app                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Joining (the application, with documents) | The whole form, with documents picked from the phone; "my applications"           |
| Forgot password, and setting a new one    | In the app; the email's link still opens the site, where it also works            |
| News, events, guidelines open to everyone | Readable without signing in, as on the site (today the app asks to sign in first) |
| Checking a membership card                | Scanning a member's card code (needs the camera library, §4)                      |

**C. For the association's staff (the admin area)**

Every admin page, each shown only to who has its permission, as on the site: the dashboard; applications; members and a member's page; accounts and roles; news with its editor, review and categories; events with their editor, sessions, speakers, registrations, attendance and its code; education with its editor and review; exam questions; guidelines; broadcasts; chat reports, rooms and their settings; institutions; the member import; settings; the audit log.

**What would differ from the site, and why**

- **Tables become lists of cards.** A phone is too narrow for the site's tables.
- **The text editor for news, events and education is a plain text box with a preview,** not the site's toolbar.
- **Passkeys still can't work in the app** until the site has real hosting with its own address (M14 §1).
- **Education videos open in the phone's browser or its YouTube app.** The site itself only links to where a video is hosted.
- **Exports (the attendance list, the audit log) are saved or shared as files** through the phone's own share sheet.
- **"Unsubscribe" from an email stays a web page:** it opens from a link in an email.

## 3. Rules

The rules of M14 §4 stand. In addition:

- **The app never decides who is staff.** It shows the admin entry when the API says the person has an admin permission, and every admin request is checked by the API again.
- **An admin action that the site asks to confirm is asked to confirm in the app too,** with the same words.
- **No text is written into the code;** every text comes from the site's existing texts, or is added in Hebrew and English.

## 4. New libraries (each needs your approval)

| What                               | Why                                                              |
| ---------------------------------- | ---------------------------------------------------------------- |
| `expo-camera`                      | Scanning the venue's code and a member's card code               |
| `expo-file-system`, `expo-sharing` | Saving calendar files and exports, and handing them to the phone |
| `expo-clipboard`                   | "Copy text" in chat, and copying recovery codes                  |

They are installed under the project's own rules (a release at least seven days old; the trust check). If a rule refuses one, I tell you and do not work around it.

## 5. Tests

- **Rules of each screen** as rule tests, as in M14 (what is shown and offered in each state).
- **The checklist by hand** (`docs/demo/MOBILE_CHECKLIST.md`) grows with each area.
- **Component tests** (every screen rendering in both languages, a name on every control) were planned in M14 and not written. They would be added here for the screens of both parts, with the libraries already approved in M14 §6.
- **No automatic test taps through the app on a phone;** that still needs an emulator, which this project does not have.

## 6. Order of work (a commit at each step; no stop between steps unless something blocks)

1. Education, exam practice and results.
2. Guidelines; the member directory; search.
3. My profile; my membership; account security; the accessibility statement; a broadcast message.
4. What chat left out in part 1.
5. The camera and file libraries: attendance scanning, card checking, calendar files.
6. Without signing in: the open pages; joining; forgot password.
7. Admin: the dashboard, applications, members, accounts and roles.
8. Admin: news, events, education, exam questions, guidelines.
9. Admin: broadcasts, chat reports and rooms, institutions, import, settings, the audit log.
10. Component tests; the checklist; documents; `PROJECT_STATUS.md`; demo.

Git: the screens of M14 that are not merged yet go in as their own pull request first. M15 then goes in as two pull requests: steps 1 to 6 (members), and 7 to 10 (staff).

## 7. Risks

| Risk                                                         | What is done about it                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Much is built before any of it is tried on a phone           | Each step can be opened in Expo Go as soon as it is committed; what you report is fixed before the next  |
| Mistakes of part 1 are repeated across twice as many screens | Going through the checklist for part 1 early finds the shared mistakes once                              |
| Two front ends drift apart                                   | One API, one set of texts; rules shared in a package where both need them, as was done for chat          |
| An admin screen on a phone invites hurried, wrong actions    | The same confirmations as the site; nothing is made easier to do than it is there                        |
| The work is long                                             | Ten steps, each useful by itself; the order puts what members use first, and you can stop after any step |

## 8. Questions for the owner

1. **The admin area too?** It is more than half of this plan. (a) Yes, everything, as asked. (b) Members' and visitors' parts now (steps 1 to 6); the admin area stays on the site for now.
2. **The three libraries of §4:** approved?
3. **The order of §6:** as proposed, or something first?

## 9. Owner answers

Given on 2026-10-05: "1.b 2.approved 3.as proposed".

1. **The admin area stays on the site for now.** Part C of §2 and steps 7 to 9 of §6 are not built. Steps 1 to 6 and step 10 are.
2. **The three libraries of §4 are approved.**
3. **The order of §6,** as proposed.

The owner also asked, on the same day and before this plan, for the work to go on without stopping at checkpoints.
