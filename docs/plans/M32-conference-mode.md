# M32: Conference mode

**Status: approved by the owner on 2026-10-31 (§10), with the conference guest entry (§4). Being built on branch `feat/m32-conference-mode`.**

Track: Phase 3. Size: M. Date to meet: **the Israeli urology conference on Monday 30 November 2026**, the owner's date. The earlier "Needs first" is changed: M21's push notifications are not built and can't be by then, so §2 gives reminders another way.

## 0. What was checked (2026-10-31)

**Already built (M5, M14, M15), and used as it is:**

- Events with sessions, rooms, speakers and materials, on the site and in the app (`apps/api/src/modules/events`, `apps/web/src/features/events`, `apps/mobile/src/features/events.tsx`).
- "My schedule": a member picks sessions while registered for the event (`schedule_items`, the `MySchedule` screens, an `.ics` file).
- **Attendance per session is already there.** A staff member shows a QR code that renews (a signed code, valid five minutes); a member scans it with the app's scanner or opens it on the site. Staff can mark by hand, void a record and download a CSV. So the old plan's "attendance by scanning" needs only a check at the rehearsal, and a way to reach the code from the chair's screen.
- Event reminders by email, a week and a day before, from a job that runs every 15 minutes. Emails on the hosted demo go to a folder, not to people.
- A live stream (`chat-stream.ts`, over `RealtimeBus`, PostgreSQL's notify and listen). It is written for chat and tied to one person; its rule carries over: **an event names ids only, and the reader then asks through the ordinary routes.**

**Not built, and found to matter:**

1. **Real people can't use the hosted demo as it stands.** `DEPLOYMENT.md` says every line of the readiness checklist must be ticked before a real member's details are loaded, and none is. M19 and M20 can't be finished by 30 November. HANDOFF also says a real organisation's name appears only with its written agreement. Question 1 in §9 follows from this. It is the most important decision in this plan.
2. **A hall shares one internet address, and the rate limits count by address.** The limit is 300 requests a minute for all routes together and 20 sign-ins a minute. Hundreds of phones on the venue's Wi-Fi would be refused within seconds, and with the live reloads the app does today a few dozen could be enough. The limits are also counted in one process's memory. This has to be solved for the event (§4), without weakening sign-in protection for an attacker.
3. **The app exists only for Android, as an .apk.** Anyone with an iPhone can use only the site. So the site gets every screen, equal to the app, not after it.
4. **No push notifications.** Without them, a notice in the app is seen only when the app is opened (§9, question 4).
5. **The chat stream's way of telling everyone "reload" would flood the server** when a whole hall votes in the same few seconds (§4).
6. **All demo accounts share one password, including the staff accounts** (`DEMO_PASSWORD`). It can't be handed out to a crowd, and one shared account can't give one vote per person. So people at the conference need another way in (§4).
7. **The security check is failing today** on five new `node-forge` advisories in Expo's developer tool, and every pull request shows it. The fix can be installed from 3 November under the 7-day rule. That update comes first, or the milestone can't reach green checks.

## 1. Goal

During a conference, a person sees what is on now and next and their own schedule, and in a session can vote in a live poll, ask a question and leave feedback, on the site and in the app, on the shared Wi-Fi of a full hall.

**Why:** specification §11. Events, sessions, personal schedules and attendance exist; this is the live layer.

## 2. Scope

**In, in the order they matter (if time runs short, the cut starts from the bottom):**

1. **Now and Next** for an event, with the room, and "my schedule" as the first thing on the event's page while it runs. Times in the event's time zone.
2. **Live polls:** a chair opens a prepared or typed poll, people vote once, results appear live, and the chair closes it.
3. **Audience questions:** sent, up-voted, and answered or hidden by a moderator.
4. **Anonymous feedback** on a session: a rating from 1 to 5 and an optional short comment.
5. **Session reminders,** 10 minutes before a session in "my schedule" (§9, question 4).
6. **The chair's screen:** one page for a session with its polls, its questions and its attendance QR code, big enough to show on the hall's projector.
7. **The hall's load:** the rate-limit change and a load test (§4, §6). This one is not cut, whatever else is.

**Not in:**

- Streaming video, exhibitors, sponsors, maps.
- CME credits (M22): attendance is recorded only.
- Push notifications through an outside service (M21).
- iPhone app.
- The real conference's programme, name or logo, unless question 1 is answered that way and the agreement exists.

## 3. Rules

- **A vote can't be traced to a person, by staff or in the database.** Who voted and what was voted are stored apart, with no link: a list of who has voted in a poll, and a counter on each option. The same for feedback: who gave it, and the rating and comment, apart and without a time. Their ids are random, not the time-ordered ids used elsewhere, because those carry the time. The audit log records that a poll was opened and closed, never a vote.
- One vote per person per poll; it can't be changed.
- Questions carry the asker's name, unless the chair allows anonymous ones for that session.
- A moderator sees a question before the hall does, if the chair chooses. **That is the default,** because a free-text question can name a patient. The form says not to include identifying patient details.
- Only signed-in people or conference guests (§4) vote, ask or give feedback. A person takes part if they may see the event (its access tier); registration is needed only for "my schedule", as today.
- **Chair and moderator are given per session** by whoever holds `events.manage` for that event, and they are people with accounts (a speaker record is not an account). A chair or moderator of one session can't touch another's.
- All text through i18n, in Hebrew and English. The contents of a poll or a question are in the language they were written in.
- Every poll and question in the demo's seed uses fictional people, is shown only after the owner's review (the owner is the medical reviewer), and has no real patient details.

## 4. What is built

**Data (one migration, reversible):**

- `session_staff`: session, person, role (chair or moderator).
- `polls`, `poll_options` (with a vote counter), `poll_voters` (who has voted, without the choice).
- `session_questions`, `session_question_votes`.
- `session_feedback` (rating, comment), `session_feedback_given` (who, without the content).
- A sent-log for session reminders, as `event_reminders` does for events.

**Server:**

- `EventLiveStream`, a stream per event on the existing `RealtimeBus`, for anyone who may see the event. It says only "this poll changed" or "the questions of this session changed".
- **Against a flood:** events about a poll or a question list are gathered and sent at most once every two seconds, per session, and the site and the app wait a random part of a second before asking again. Results are read from the counters, not counted row by row. When the stream drops, the screens ask every 15 seconds and show that they are not live.
- **The rate limits in a hall:** the routes of the live screens count by signed-in person instead of by address (the existing `by: 'user'` and `replacesGlobal`), with limits sized in the load test. **The sign-in limits stay as they are.** Exact numbers go in the status file after the load test.
- **The conference guest entry (new, the owner expects more than 20 people a minute to come in):** a QR code on the chair's screen and on a printed card opens the demo conference and makes a fresh guest account for that phone, with a made-up name ("Guest 214") and no email, password or personal detail. A guest can see the demo conference and vote, ask and give feedback there, and nothing else: no chat, no directory, no other section. Only this route has a higher limit by address, sized in the load test; it exists only with `DEMO_HOSTED`, only from a time the owner sets until the end of the event day, and is refused in real production. The ordinary sign-in and the demo password are untouched. Guests and what they wrote are deleted a set time after the event, under the rule of question 7 for questions.
- The reminders job gains session reminders, or a job of its own every few minutes.
- Audit log: chair and moderator given, poll opened and closed, question hidden.

**Site and app:** the event page's live part, the voting and question screens, the feedback form, the chair's and the moderator's screens, each with tests, in both languages and right-to-left. The site and the app use the same rules from `packages/api-client`, as chat does.

**Demo:** a fictional conference in the seed, with fictional speakers, whose sessions are timed from "now" whenever the demo is reset, so that "now" always has something on.

## 5. New libraries, services and costs (each needs the owner's approval)

- **No outside service.**
- **One library, chosen by the owner (question 4):** `expo-notifications`. It schedules a reminder on the phone itself, with no outside service; it adds a permission prompt to the app.
- **Railway:** a load test, and a day with hundreds of live connections, use more than usual (this month's estimate was about $3.71 plus the plan fee). The actual figure is read with `railway usage` after the load test and reported. A larger plan or more memory is asked for first.

## 6. Tests

- Unit: Now and Next at the edges of a session, in the event's time zone. One vote per person, also when two arrive together. A closed poll refuses votes. The "at most every two seconds" gathering.
- Integration: **no way from a vote or a feedback to a person,** checked against the tables themselves; a chair of one session is refused on another; hidden and not-yet-approved questions never reach an ordinary reader; a person who may not see the event gets nothing from the stream.
- Integration, the guest entry: a guest can reach nothing outside the demo conference; the route is closed outside its time and in real production; guests are deleted on time.
- Browser (site): a poll from opening to results with two people; a question from sending to approval to answer; both languages.
- App: the screens' tests, as for every feature. Then on the owner's phone.
- **Load test on the hosted demo with fictional accounts,** from one address like a hall: 300 guests arriving within 5 minutes, then 300 people on the stream for 30 minutes, and all of them voting within 20 seconds. Passes when no one is refused, a vote is answered within 2 seconds in 95 of 100 cases, and results reach everyone within 5 seconds. It is run only with the owner's agreement, because it costs a little and the demo is slow while it runs. The load tool is decided in step 7; if it isn't already in the repository, it needs the owner's approval.
- **A rehearsal with real people's phones** and fictional accounts, on a shared Wi-Fi, with both an Android and an iPhone. It is an exit criterion.

## 7. Order of work (a commit at each step; tests green at each)

Dates are targets, and depend on approval by 3 November and on the answers in §9.

| #   | Step                                                                       | By        |
| --- | -------------------------------------------------------------------------- | --------- |
| 0   | The `node-forge` update, in its own pull request, so the checks are green  | 3–4 Nov   |
| 1   | Plan approved, §9 answered                                                 | 3 Nov     |
| 2   | Now, Next, my schedule first; the demo's fictional conference              | 6 Nov     |
| 3   | Chairs and moderators; the guest entry; the live stream with its gathering | 9 Nov     |
| 4   | Polls, and the chair's screen                                              | 11 Nov    |
| 5   | Questions and moderation                                                   | 13 Nov    |
| 6   | Feedback; session reminders; the attendance code on the chair's screen     | 15 Nov    |
| 7   | Rate limits for the hall; the load test; fixes; pull request               | 18 Nov    |
| 8   | Merge, hosted demo and a new .apk, each on the owner's word                | 19 Nov    |
| 9   | The rehearsal with real phones; fixes                                      | 22 Nov    |
| 10  | **Nothing new from 23 November.** Only fixes the owner agrees to           | 23–30 Nov |
| 11  | Documents, `PROJECT_STATUS.md`, the demo                                   | 30 Nov    |

The owner also needs time for: the seed's polls and questions (medical review), the Hebrew texts, and the rehearsal.

## 8. Risks

| Risk                                                                 | What is done about it                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Real people's details on a server not ready for them                 | Question 1. The default is that no real person's details go in                                                                             |
| A real organisation's name or conference shown without agreement     | The demo's conference is fictional. A real one only with the written agreement                                                             |
| Hundreds of phones behind one address are refused                    | §4, and the load test passes from one address                                                                                              |
| A whole hall votes in the same seconds                               | Gathered events, random waits, counters, and a load test of exactly this                                                                   |
| The venue's Wi-Fi is weak or there is none                           | The screens fall back to asking every 15 seconds and work on mobile data. If it's a live demo, the owner also keeps a phone on mobile data |
| The first real use is in front of a full hall                        | The rehearsal is an exit criterion, and everything is frozen a week before                                                                 |
| The hosted demo restarts or a deploy goes wrong that day             | No deploy from 23 November except an agreed fix; none on the day. Votes are in the database, so a restart loses none                       |
| A question names a patient                                           | Moderation first by default, the warning on the form, and hidden questions are shown to no reader                                          |
| A month is short                                                     | The cut order in §2. If step 7 slips past 22 November, reminders and feedback are left out rather than the rehearsal                       |
| Polls could be taken for an official vote or a survey of the members | They are labelled as audience polls. Formal voting is M35, with its own legal review                                                       |

## 9. Questions for the owner

1. **What should happen at the conference on 30 November?** (This decides the rest.)
   - **A. A demonstration (recommended).** You show it to people at the conference, on the hosted demo, with the fictional conference and fictional accounts. No agreement or legal review is needed, and no real person's details go in. People can try it on their phones with a demo account you hand out.
   - **B. One real session, with the organisers' agreement.** Real attendees vote and ask in one session. It needs: the organisers' written agreement, a lawyer's answer on what may be collected and how, and accounts that hold no real details. That would add to the plan and needs its own decision, and the agreement would be needed by about 15 November.
   - **C. The whole conference, for real.** Not possible by 30 November: it needs M19 and M20 (the readiness checklist) first, and those are larger than the month left.
2. **Do you already have contact with the conference's organisers,** and do you expect a written agreement? This matters only for B, and for naming the conference anywhere.
3. **Who runs polls and moderates questions in the demonstration?** I assume you, with a demo account each for a chair and a moderator. Tell me if someone else will.
4. **Session reminders:**
   - **A.** A notice inside the app and on the site only: no new library, but it's seen only when the app is open.
   - **B. (recommended if you want reminders to be noticed)** Also a reminder scheduled on the Android phone itself with `expo-notifications`: it appears on a locked phone, with no outside service. One new library and a permission prompt. iPhones on the site get only the notice.
   - **C.** Leave reminders out for now, and cut this step.
5. **May chairs allow anonymous questions?** I recommend yes, per session, off by default.
6. **How many people do you expect at a time?** The load test assumes 300 on the stream, and sign-ins mostly before arriving, as the 20-a-minute limit per address stays. Tell me if you expect more, or if many must sign in together in the hall, since that would need its own decision.
7. **What happens to the content after the event?** I recommend: poll results and feedback stay with the event; questions are deleted 30 days after it. On the demo this is fictional anyway, but it sets the rule.

## 10. Owner answers

Given on 2026-10-31:

1. **A, a demonstration,** on the hosted demo, with the fictional conference. No real person's details go in, and the real conference is not named in the product.
2. **No contact with the organisers.** So no agreement is expected, and B is closed.
3. **The owner** runs the polls and moderates the questions.
4. **B:** a notice in the app and on the site, and also a reminder scheduled on the Android phone with `expo-notifications` (the new library is approved by this answer).
5. **Yes:** chairs may allow anonymous questions, per session, off by default.
6. **More than 20 sign-ins a minute are expected.** The load test's 300 people is kept, as no other number was given. The guest entry in §4 is the answer to this, approved by the owner with the plan.
7. **As recommended:** poll results and feedback stay with the event; questions are deleted 30 days after it.
