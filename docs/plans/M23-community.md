# M23: Professional communities

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: L. Needs first: Nothing technical. A decision on how it differs from chat rooms, which exist.

## 1. Goal

Members post and discuss by subspecialty: a post with comments that stays findable, unlike a chat room's stream.

**Why:** Specification §17. Chat rooms (M12) already give subspecialty conversation; a community adds lasting, searchable, threaded discussion.

## 2. Scope

**In**

- Communities by subspecialty (the specification's eleven), opened by staff.
- A post (title, text, files as in chat), comments in threads, reactions, bookmarks, following a community or a post.
- Reports and moderation with the tools rooms already have (remove with a reason, ban, lock).
- A feed of what the member follows; search covers posts.
- Notifications for replies and mentions, with a switch.
- On the site and in the app.

**Not in**

- Case discussions (M24): they have their own form and stricter rules.
- Anonymous posting.
- Members opening their own communities.

## 3. Rules

- Members with an active membership only, by name, as in rooms.
- The standing notes about patients apply; the patient-details check runs on posts and comments and warns before posting.
- Staff can read a community; that is said on its page (as for rooms).
- A removed post leaves a marker; the audit log has who removed it and why.

## 4. What is built

**Data:** `communities`, `posts`, `comments`, `post_reactions`, `bookmarks`, `follows`. Reports reuse chat's.

- Server: a `community` module reusing the files, reports and moderation pieces. Site and app: the feed, a community, a post, writing and moderating.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Who may read and write; moderation; a removed post's comments; notifications only to followers; the patient-details warning.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved
2. Data and rules
3. Posts and comments
4. Reactions, bookmarks, follows, the feed
5. Reports and moderation
6. Notifications and search
7. App
8. Documents, status, demo

## 8. Risks

| Risk                                             | What is done about it                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| It duplicates chat rooms and splits the audience | Question 1; one option is to grow rooms into this instead of building a second place |
| Moderation load on volunteers                    | The same tools and reports queue as rooms; no new place for staff to watch           |

## 9. Questions for the owner

1. Communities beside chat rooms, or instead of them, or rooms extended with threads?
2. Who moderates each community?
3. May residents and students take part?

## 10. Owner answers

None yet.
