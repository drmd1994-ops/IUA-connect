# 0006. Admin portal as a route group inside the web app

- Status: Accepted (admin screens from M2)
- Date: 2026-09-27
- Decision owner: project owner (HANDOFF decision 15)

## Context

The admin portal needs its own layout and stricter session rules, but shares design tokens, i18n and the API client with the member site.

## Decision

`/admin` is a Next.js route group in `apps/web` with its own layout. Server-side checks require an admin role **and** MFA completed in the current session; admin sessions are shorter. The API enforces the same rules independently: the frontend hides what a user can't do but never enforces it.

## Alternatives considered

- **A separate admin app:** stronger isolation and separate deployment, but duplicated setup for a single developer.

## Consequences

- One app to build and deploy; the admin code is split by route.
- It can move into its own app later if isolation is needed (e.g. a separate admin domain).
