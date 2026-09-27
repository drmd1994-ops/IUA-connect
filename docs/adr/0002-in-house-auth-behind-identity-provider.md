# 0002. In-house authentication behind an `IdentityProvider` interface

- Status: Accepted (implementation in M1)
- Date: 2026-09-27
- Decision owner: project owner (D13 / HANDOFF decision 14)

## Context

The MVP needs registration, email verification, TOTP MFA, recovery codes, sessions and devices, refresh rotation with reuse detection, and a custom verification workflow. Admins and directors must use MFA.

## Decision

Implement authentication inside the NestJS API with proven libraries (Argon2id, RFC 6238 TOTP, EdDSA JWTs), behind an `IdentityProvider` interface. Access tokens are short-lived; roles and permissions are resolved server-side per request and never read from the token. Passkeys follow in M1b.

## Alternatives considered

- **Keycloak / external OIDC now:** mature, but another server to run on Windows, and harder to fit the verification flow and the demo setup.
- **Hosted identity (Auth0, Entra ID):** fast, but a third party would hold member data before the legal review, plus cost.

## Consequences

- Full control and a single deployable, but security-critical code that must be tested thoroughly (the M1 suite covers reuse detection and lockout).
- An external OIDC provider can replace the local implementation later through the interface.
