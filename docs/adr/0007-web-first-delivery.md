# 0007. Web first; mobile after the API is stable

- Status: Accepted
- Date: 2026-09-27
- Decision owner: project owner (D5)

## Context

The pitch needs a convincing product soon. The spec also asks for a mobile app (Expo).

## Decision

Build a responsive Next.js web app first. Start the Expo app (M8+) only once the API is stable. The API is ready for both from the start: token-based auth, a generated typed client, and design tokens in a platform-neutral package.

## Alternatives considered

- **Web and mobile in parallel:** doubles the UI work while the API is still changing.
- **Mobile first:** weaker for admin work and for a pitch shown on a laptop.

## Consequences

- A faster path to a demo; members use the responsive web app on their phones until the Expo app arrives.
- Push notifications and biometric login wait for the Expo app.
