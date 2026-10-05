import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'iua:rateLimits';

export interface RateLimitRule {
  /** Distinguishes counters of different rules on the same route. */
  name: string;
  limit: number;
  windowSec: number;
  /**
   * What is counted: the client IP, or the account named in the request body (`email`, or the
   * MFA challenge token), so one account can't be attacked from many IPs; or the signed-in
   * person, counted by the route itself once it knows who is asking (hitUserLimit).
   */
  by: 'ip' | 'account' | 'user';
}

/** Route-specific limits, applied in addition to the global per-IP limit (API_DESIGN.md §5). */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_KEY, rules);

export const RATE_LIMITS = {
  global: { name: 'global', limit: 300, windowSec: 60, by: 'ip' },
  signInPerAccount: { name: 'signin-account', limit: 5, windowSec: 60, by: 'account' },
  signInPerIp: { name: 'signin-ip', limit: 20, windowSec: 60, by: 'ip' },
  accountCreationPerIp: { name: 'account-email-ip', limit: 5, windowSec: 3600, by: 'ip' },
  cardVerifyPerIp: { name: 'card-verify-ip', limit: 60, windowSec: 60, by: 'ip' },
  uploadPerIp: { name: 'upload-ip', limit: 30, windowSec: 60, by: 'ip' },
  directoryPerUser: { name: 'directory-user', limit: 30, windowSec: 60, by: 'user' },
  searchPerIp: { name: 'search-ip', limit: 60, windowSec: 60, by: 'ip' },
  searchPerUser: { name: 'search-user', limit: 60, windowSec: 60, by: 'user' },
  // Chat (M11 plan §3)
  chatMessagesPerUser: { name: 'chat-messages-user', limit: 30, windowSec: 60, by: 'user' },
  chatConversationsPerUser: {
    name: 'chat-conversations-user',
    limit: 10,
    windowSec: 3600,
    by: 'user',
  },
  chatReportsPerUser: { name: 'chat-reports-user', limit: 10, windowSec: 3600, by: 'user' },
  chatSearchPerUser: { name: 'chat-search-user', limit: 60, windowSec: 60, by: 'user' },
  chatTypingPerUser: { name: 'chat-typing-user', limit: 1, windowSec: 3, by: 'user' },
  // Chat rooms (M12 plan §3)
  chatReactionsPerUser: { name: 'chat-reactions-user', limit: 60, windowSec: 60, by: 'user' },
  chatJoinsPerUser: { name: 'chat-joins-user', limit: 20, windowSec: 3600, by: 'user' },
  // Groups, invitations and files in chat (M13 plan §3)
  chatGroupsPerUser: { name: 'chat-groups-user', limit: 5, windowSec: 86_400, by: 'user' },
  chatInvitationsPerUser: {
    name: 'chat-invitations-user',
    limit: 60,
    windowSec: 86_400,
    by: 'user',
  },
  chatUploadsPerUser: { name: 'chat-uploads-user', limit: 30, windowSec: 600, by: 'user' },
} as const satisfies Record<string, RateLimitRule>;
