import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'iua:rateLimits';

export interface RateLimitRule {
  /** Distinguishes counters of different rules on the same route. */
  name: string;
  limit: number;
  windowSec: number;
  /**
   * What is counted: the client IP, or the account named in the request body (`email`, or the
   * MFA challenge token), so one account can't be attacked from many IPs.
   */
  by: 'ip' | 'account';
}

/** Route-specific limits, applied in addition to the global per-IP limit (API_DESIGN.md §5). */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);

export const RATE_LIMITS = {
  global: { name: 'global', limit: 300, windowSec: 60, by: 'ip' },
  signInPerAccount: { name: 'signin-account', limit: 5, windowSec: 60, by: 'account' },
  signInPerIp: { name: 'signin-ip', limit: 20, windowSec: 60, by: 'ip' },
  accountCreationPerIp: { name: 'account-email-ip', limit: 5, windowSec: 3600, by: 'ip' },
  cardVerifyPerIp: { name: 'card-verify-ip', limit: 60, windowSec: 60, by: 'ip' },
} as const satisfies Record<string, RateLimitRule>;
