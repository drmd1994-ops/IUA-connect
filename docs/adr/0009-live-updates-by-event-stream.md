# 0009. Live updates by an event stream over PostgreSQL notify

- Status: Accepted
- Date: 2026-10-04
- Decision owner: project owner (M11 plan §10, answer 2)

## Context

Chat (M11) needs messages, edits, read status and "is typing…" to reach an open page without a refresh. Until M11 the app had no live connection: the bell asks for its number once a minute. Decision D15 keeps the demo on PostgreSQL only, and new libraries need the owner's approval.

## Decision

**Server to browser: one event stream per open chat page.** `GET /api/v1/chat/stream` answers `text/event-stream` (server-sent events, built into NestJS). The browser sends with the ordinary routes and listens on the stream.

- The web app reads the stream with `fetch`, not `EventSource`, so the access token travels in the `Authorization` header like every other request, and never in an address.
- An event names ids only (`message.new` with a conversation and a message number, `markers`, `typing`, `refresh`). The page then asks the ordinary routes for what it may see, so the stream can't show a person text that isn't theirs.
- A stream ends after ten minutes and the page opens a new one with a fresh token, so a session that was ended elsewhere stops receiving within minutes. A person has at most three streams; a fourth closes the oldest.
- After a dropped connection the page reconnects and asks for what came after the newest message it has. While the stream can't be opened at all, the page asks every ten seconds instead.

**Between the parts of the server: PostgreSQL `NOTIFY` and `LISTEN`,** behind `RealtimeBus` (`apps/api/src/infra/realtime/`). Publishing goes through the ordinary connection pool; each API process holds one extra connection that listens, opened when its first stream opens. A message written through one process reaches a browser connected to another.

Checked before any chat code was written: the web server's forwarding of `/api/v1` passes the stream through as it is written (one event a second arrived a second apart through `next start`), and forwards the `Authorization` header.

## Alternatives considered

- **A WebSocket library (`@nestjs/websockets` with `ws` or Socket.IO):** a new dependency and a second way of authenticating, for a two-way channel chat doesn't need, because sending is an ordinary request either way.
- **Asking every few seconds:** no new parts at all, but slower, more requests, and no "is typing…".
- **Redis pub/sub:** the usual choice at scale, and not allowed for the demo (D15). It can replace PostgreSQL behind `RealtimeBus` later.

## Consequences

- No new library. One more long-lived database connection per API process, and one open HTTP response per open chat page.
- Events are hints: a lost one costs a delay until the next event or the next refresh, never data. Nothing is stored for typing.
- A notification payload is limited to 8000 bytes by PostgreSQL; events carry ids and a list of recipients, so a room with thousands of members (M12) must publish by room, not by listing its people.
- How many open streams one server holds was **not load-tested**. Before real use this needs a test, and probably Redis and a limit at the reverse proxy.
- A reverse proxy in front of the site must not hold the stream back (for nginx: `proxy_buffering off` for this path; the response already says `X-Accel-Buffering: no`).
