# Performance

How fast the public pages load, what was fixed in M9, and what was not. Measured on 2 October 2026.

## How it was measured

- **Tool:** Lighthouse 13.5.0 (`npx lighthouse`), performance category only.
- **Conditions:** Lighthouse's default mobile test: a mid-range phone on a slow 4G connection, both simulated. This is deliberately harsh; it is the usual yardstick.
- **What ran:** production builds of the site and the API (`pnpm build`, then `start`), on the development computer, with the demo data. Hebrew pages, signed out.
- **One run per page.** Simulated numbers move by about 0.1 s between runs, so small differences mean nothing.

The targets (from the M9 plan, Google's "good" thresholds): the main content painted within **2.5 s** (LCP), layout jumps under **0.1** (CLS), main-thread blocking under **200 ms** (TBT).

## Before and after

| Page       | LCP before | LCP after | CLS before | CLS after | TBT after | Scripts before | Scripts after | Score before | Score after |
| ---------- | ---------- | --------- | ---------- | --------- | --------- | -------------- | ------------- | ------------ | ----------- |
| Home       | 3.48 s     | 2.99 s    | 0.046      | 0.046     | 33 ms     | 306 KB         | 210 KB        | 90           | 94          |
| News list  | 3.06 s     | 2.58 s    | **0.575**  | 0.031     | 28 ms     | 305 KB         | 209 KB        | 72           | 97          |
| An article | 3.94 s     | 3.47 s    | **0.417**  | 0.031     | 54 ms     | 339 KB         | 243 KB        | 67           | 91          |
| Events     | 3.03 s     | 2.97 s    | **0.406**  | 0.031     | 30 ms     | 305 KB         | 209 KB        | 75           | 94          |
| Education  | 3.04 s     | 2.97 s    | 0.031      | 0.031     | 27 ms     | 305 KB         | 209 KB        | 94           | 94          |
| Guidelines | 3.48 s     | 2.97 s    | **0.211**  | 0.031     | 27 ms     | 307 KB         | 210 KB        | 80           | 94          |
| Search     | 3.33 s     | 2.97 s    | **0.193**  | 0.031     | 29 ms     | 304 KB         | 208 KB        | 82           | 94          |
| Sign-in    | 3.48 s     | 2.98 s    | 0.089      | 0.079     | 30 ms     | 307 KB         | 211 KB        | 88           | 93          |

Script sizes are as transferred (compressed).

**What this says**

- **Layout jumps: target met on every page.** Five pages were well over the limit; all are now under it.
- **Blocking: target met on every page**, before and after.
- **Main content within 2.5 s: not met.** Every page improved, by up to half a second, but they sit at about 3.0 s on the simulated slow phone (the article at 3.5 s). See "What is left" below.
- On the development computer itself, without the simulated slow phone, the main content appears in **0.1 to 0.25 s**. A pitch on a laptop will feel instant; the numbers above are about a member on a weak mobile connection.

## What was changed

1. **A third less script.** Every visitor was downloading the whole validation library (zod) only so the site could recognise the API's error format. That check is now a few lines written by hand (`isErrorEnvelope` in `packages/api-client`), with a test that holds it to the shared schema. About 95 KB less on every page.
2. **The footer no longer jumps.** The page body keeps a minimum height while content is being fetched, so the footer isn't painted high and then pushed down. This was the biggest part of the layout jumps.
3. **Pictures keep their place.** List pictures (news, events, education) reserve their box before the picture's address arrives.
4. **Filters keep their place.** The category filter on the news and events lists is there from the start, instead of appearing once the categories arrive and pushing the list down.

## The API

Median of five requests on the development computer, demo data, signed out:

| Request          | Time |
| ---------------- | ---- |
| News list        | 8 ms |
| Events list      | 5 ms |
| Event categories | 2 ms |
| Education list   | 5 ms |
| Guidelines list  | 6 ms |
| Search ("כנס")   | 4 ms |

Nothing is slow, but the demo holds a few dozen items and a few dozen people, and at that size the database reads whole tables whatever indexes exist. So the timings say little about a full association.

**Query plans.** To see what would happen with far more data, the database was asked for its plan for each main query with whole-table reads discouraged (`EXPLAIN` with `enable_seqscan = off`):

| Query                               | Index it uses                                  |
| ----------------------------------- | ---------------------------------------------- |
| News list, newest first             | `news (status, published_at)`                  |
| Upcoming events                     | `events (status, start_at)`                    |
| Education list                      | `education_items (status, published_at)`       |
| Search, by words                    | the full-text index on each translations table |
| Search, a typing mistake in a title | the trigram index on the title                 |
| One person's notices                | `notifications (user_id, created_at)`          |
| The member directory, by name       | the index over listed profiles only            |
| **The audit log, newest first**     | **none: it would read and sort the whole log** |

The audit log is the table that grows fastest and is never trimmed, so that one mattered. **Fixed:** migration `20261003000000_audit_log_time_index` adds an index on `(at, id)`, newest first, which the page now uses with or without filters.

What this does not show is how the system behaves under many simultaneous users. No load test was run (listed in `KNOWN_LIMITATIONS.md`).

## What is left

**Why the pages stay near 3 s on a slow phone.** The server sends each public page with its heading and frame, and the browser then asks the API for the list or the article after the scripts have loaded. On a slow connection that is two waits in a row. The sign-in page has no content to fetch and still measures 3.0 s, which shows the remaining cost is mostly the framework's own script (about 200 KB) on a slow line.

**What would fix it.** Have the server fetch public content and send the finished page (news, events, education, guidelines, an article). This is a real change to how the public pages are built, not a tweak: it touches every public page and how signed-in members get their members-only items on the same lists. It was not in the M9 plan and was not done. It is a sensible first task after the pitch, and it would also let search engines read the public pages.

**Not done: letting browsers keep public API answers.** The plan listed caching headers as a possible fix. They would speed up a second visit, not the first one that is measured here, and the same addresses answer differently for signed-in members (members-only items), so a mistake there could show a member's list to someone else. The opposite was done: API answers now tell browsers and proxies to keep nothing (see `docs/security/ZAP_BASELINE.md`). The numbers above were measured before that change; it does not affect a first visit.

**A small jump remains (0.031 on every page):** the page body moves slightly once, shortly after the first paint. It is under the limit; its cause was not tracked down.

## Repeating the measurement

```powershell
pnpm build
pnpm --filter @medconnect/api start     # one window
pnpm --filter @medconnect/web start     # another window
npx --yes lighthouse@13.5.0 http://localhost:3001/he --only-categories=performance --view
```
