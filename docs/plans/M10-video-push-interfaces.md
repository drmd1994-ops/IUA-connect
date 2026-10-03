# M10 — Video and push connection points: plan

- Status: **Approved by the owner on 2026-10-03**
- Date: 2026-10-03
- Asked for by the owner on 2026-10-03: "out of the five unbuilt interfaces build number 2 and 3 for now" (`VideoProvider` and `PushProvider`; see `PROJECT_STATUS.md`, M9, "Deviations and findings").
- Design sources: `ARCHITECTURE.md` §5 (adapters), ADR 0008 (videos are links), `docs/plans/M7-notifications-search.md` (notifications).

## 1. Goal

The two connection points the planning documents promised exist in the code, each with a working demo implementation, so that a real video service or a real push service can be plugged in later without changing the features that use them.

**What this is not:** it adds no video hosting and no push notifications. With the scope below, nothing a visitor or a member sees changes. The value is a defined place to plug a service in, and tests that hold it.

**Exit criteria**

- `VideoProvider` and `PushProvider` exist as interfaces, each chosen by a setting and checked at start-up, like the existing adapters.
- The education module goes through `VideoProvider`; the notifier goes through `PushProvider`.
- Unit and integration tests cover both. CI green, `PROJECT_STATUS.md` and `ARCHITECTURE.md` updated.

## 2. Scope

### 2.1 `VideoProvider`

Today the education module itself decides what a recording is: a link (`external_url`) and a state (`EXTERNAL`, `PENDING_PROVIDER`, `NONE`). That logic moves behind an interface.

- **The interface** (`apps/api/src/infra/video/video-provider.ts`):
  - `accepts(reference)`: may this recording be attached to an item? (Today: a web link, `http` or `https`, as the education form already requires.)
  - `playback(reference, viewer)`: how the page should present it. Today the only answer is "open this link in a new tab". A hosted provider would later answer "play this, with this short-lived address".
  - `name`: which provider is in use.
- **The demo implementation,** `LinkVideoProvider` (`VIDEO_PROVIDER=links`, the default): exactly what happens today, per ADR 0008. It is allowed in production, because linking is a legitimate way to run.
- **Education uses it** for checking a link when an item is saved and for what the item page receives. The API's answers stay the same, so the web app does not change.
- **No database change.** The `video_status` column and its values stay.

### 2.2 `PushProvider`

Today the notifier has two channels: a notice in the app and an email.

- **The interface** (`apps/api/src/infra/push/push-provider.ts`):
  - `send(message)`: deliver one notice to one person's devices; answers how many devices it reached. The message is the notice's type and values, worded in the person's language, with a link inside the site.
  - `enabled`: whether push exists at all, so callers and screens can ask.
- **The demo implementation,** `DisabledPushProvider` (`PUSH_PROVIDER=disabled`, the default): sends nothing and says so. Allowed in production (push is optional).
- **The notifier calls it** after writing the notice in the app, and only when the provider is enabled. A failure in push never stops the app notice or the email, like the other channels.
- **Not in this plan:** a "push" switch in each person's notification settings, a table of people's devices, and the routes a phone would use to register. They only make sense once something can actually deliver (question 2 below).

### 2.3 Around them

- Settings in `.env.example` and the start-up check (`env.schema.ts`), with tests.
- `ARCHITECTURE.md` §5: the two rows change from "not built" to what exists. `DATABASE_DESIGN.md`, `KNOWN_LIMITATIONS.md` and `PROJECT_STATUS.md` updated. ADR 0008 gets a line that the link behaviour now sits behind the interface.
- No new library.

**Not in M10:** the other three unbuilt interfaces (payment, outside sign-in, the Medical Association's member list) and the payment tables.

## 3. Tests

- **Unit:** `LinkVideoProvider` accepts web links and refuses others; its playback answer is a link. `DisabledPushProvider` sends nothing and reports zero. The start-up check refuses unknown provider names.
- **Integration:** the existing education tests keep passing unchanged (same answers through the interface). The notifier, given a test push provider that records what it receives, sends the right notice to the right person, respects the "always on" kinds, and keeps working when the push provider throws.
- The browser suite runs unchanged.

## 4. Risks

| Risk                                                         | What is done about it                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| The interface is a guess, because no real service is chosen  | It is kept as small as the two uses need. It is expected to change when a real provider is plugged in |
| It reads as if video hosting or push notifications now exist | The documents and the known limitations say plainly that they do not                                  |
| Education behaves differently after the move                 | Its integration and browser tests must pass without being edited                                      |

## 5. Order of work (a commit at each checkpoint)

1. This plan, approved.
2. `VideoProvider`, the link implementation, education moved onto it, tests.
3. `PushProvider`, the disabled implementation, the notifier calling it, tests.
4. Documents and status; CI green; pull request.

## 6. Questions for the owner (answered on 2026-10-03)

1. **How far should video go?** Interface with today's link behaviour, or choose a real video service now. **Answer: interface only.**
2. **How far should push go?** Interface with a "disabled" implementation (recommended); or also the device table and registration routes for a future phone app; or real notifications in the browser now (needs a new library and the owner's approval of it). **Answer: interface only.**

## 7. Checkpoint

There is nothing new to click. The demo of this milestone is: the site behaves exactly as before, the tests pass, and `ARCHITECTURE.md` no longer lists these two as unbuilt.
