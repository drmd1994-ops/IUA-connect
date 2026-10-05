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

/**
 * A refresh token that was just used is accepted once more for this long, when the token that
 * replaced it was never used (owner decision 2026-10-05). It covers a renewal whose answer never
 * reached the browser, because the page was reloaded or closed while it was on its way: the
 * server had already changed the token, and the browser still held the old one. Any other use
 * of an old token still ends the session.
 */
export const REFRESH_REUSE_GRACE_SEC = 10;

/** Sensitive changes (password, MFA) need a password re-entry within this window. */
export const REAUTH_WINDOW_SEC = 5 * 60;

/** lastSeenAt is written at most this often, to avoid a database write per request. */
export const ACTIVITY_WRITE_INTERVAL_SEC = 60;

export const AUTH_TOKEN_TTL_SEC = {
  EMAIL_VERIFICATION: 24 * 3600,
  PASSWORD_RESET: 3600,
  /** "Set your password" link for accounts an import created (M2). */
  ACCOUNT_SETUP: 7 * 24 * 3600,
  MFA_CHALLENGE: 5 * 60,
  WEBAUTHN_REGISTRATION: 5 * 60,
  WEBAUTHN_AUTHENTICATION: 5 * 60,
} as const;

/** Wrong codes allowed against one MFA challenge before it is burned. */
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
