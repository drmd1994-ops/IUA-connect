/**
 * Session lifetimes (owner decision 2026-09-27, docs/plans/M1-identity.md §3):
 * - members: 7 days absolute, 3 days idle;
 * - anyone holding an administrative/director role: 4 hours absolute, 15 minutes idle.
 */
export const SESSION_POLICY = {
  member: { absoluteSec: 7 * 24 * 3600, idleSec: 3 * 24 * 3600 },
  admin: { absoluteSec: 4 * 3600, idleSec: 15 * 60 },
} as const;

export type SessionKind = keyof typeof SESSION_POLICY;

/** Access tokens are short-lived; the refresh token renews them (API_DESIGN.md §3). */
export const ACCESS_TOKEN_TTL_SEC = 10 * 60;

/** Sensitive changes (password, MFA) need a password re-entry within this window. */
export const REAUTH_WINDOW_SEC = 5 * 60;

/** lastSeenAt is written at most this often, to avoid a database write per request. */
export const ACTIVITY_WRITE_INTERVAL_SEC = 60;

export const AUTH_TOKEN_TTL_SEC = {
  EMAIL_VERIFICATION: 24 * 3600,
  PASSWORD_RESET: 3600,
  MFA_CHALLENGE: 5 * 60,
  WEBAUTHN_REGISTRATION: 5 * 60,
  WEBAUTHN_AUTHENTICATION: 5 * 60,
} as const;

/** Wrong codes allowed against one MFA challenge before it is burned. */
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
