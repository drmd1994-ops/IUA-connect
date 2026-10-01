# 0008. Videos are links to where they are hosted

- Status: Accepted
- Date: 2026-10-02
- Decision owner: project owner (M6 plan §11, answer 1)

## Context

The education library has lectures, webinars, surgical videos and podcasts. Video needs storage, transcoding, adaptive streaming and a player that works with assistive technology. The spec left the video provider open, and the demo has no budget or contract for one.

## Decision

A video, webinar, surgical video or podcast is stored as a link to where it is already hosted (`external_url`). The link opens on that site in a new tab. IUA Connect does not upload, transcode, store or embed video or audio.

Each item has a `video_status`:

- `EXTERNAL`: it has a link.
- `PENDING_PROVIDER`: the recording isn't available yet. The page says so in place of a link.
- `NONE`: the item type has no recording (article, document, case, course).

An item of a linked type can be submitted for review only with a link or marked as waiting for its recording.

## Alternatives considered

- **Embedding a player (YouTube or Vimeo iframe):** third-party scripts and cookies on IUA pages, a looser content security policy, and a consent question the demo doesn't need.
- **Hosting video ourselves:** storage, transcoding and streaming are a product of their own, and surgical videos raise patient privacy questions that need a managed provider.
- **Choosing a video provider now (Mux, Cloudflare Stream, Vimeo):** a cost and a contract before the association has agreed to the platform.

## Consequences

- No video infrastructure and no third-party scripts on IUA pages.
- Access tiers protect the item page and its link, not the recording: whoever has the link can open it on the host. Recordings meant for members only must be protected on the host (unlisted or private), until a provider is chosen.
- Viewing isn't tracked, so progress and CME credit for watching wait for a provider (Phase 2).
- Moving to a provider later adds a status and a player. The existing columns and items stay as they are.
