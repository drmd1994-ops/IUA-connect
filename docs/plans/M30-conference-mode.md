# M30: Conference mode

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 3. Size: M. Needs first: M19's push notifications make reminders useful. A real conference to try it at.

## 1. Goal

During a conference the app shows what is on now and next, reminds a member of their sessions, and lets the audience vote, ask and give feedback.

**Why:** Specification §11. Events, sessions, personal schedules and attendance already exist; this is the live layer.

## 2. Scope

**In**

- "Now" and "Next" for an event, and "my schedule" as the first screen while an event runs.
- Session reminders (push, if M19 is done; otherwise in the app).
- Live polls run by the session's chair; results shown live.
- Audience questions: sent, up-voted, answered or hidden by a moderator.
- Feedback on a session, anonymous.
- Attendance per session by scanning the session's code (feeds CME, M20).
- In the app first; the site shows the same.

**Not in**

- Streaming video.
- Exhibitors, sponsors, maps.

## 3. Rules

- Poll votes and feedback are anonymous; questions are by name unless the chair allows anonymous ones.
- A moderator sees a question before the room does, if the chair chooses.

## 4. What is built

**Data:** `polls`, `poll_votes`, `session_questions`, `session_feedback`.

- Server: live updates over the event stream chat already uses. Site and app: the live screens; the chair's and moderator's controls.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- One vote per person; anonymity; moderation; the stream under many listeners (a load test with a few hundred).

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Now, next, my schedule
3. Reminders
4. Polls
5. Questions
6. Feedback and session attendance
7. A rehearsal with real people
8. Documents, status, demo

## 8. Risks

| Risk                                      | What is done about it                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Hundreds of phones on a venue's Wi-Fi     | A load test; the screens degrade to "refresh" when the live stream drops, as chat does |
| First real use is in front of a full hall | A rehearsal is an exit criterion                                                       |

## 9. Questions for the owner

1. Which conference would be the first, and when?
2. Who runs polls and moderates questions?

## 10. Owner answers

None yet.
