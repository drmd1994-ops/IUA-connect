import { type Response } from 'express';
import { type RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import { type RateLimitRule } from '../decorators/rate-limit.decorator';
import { AppException } from '../errors/app.exception';

/**
 * A limit counted per signed-in person (API_DESIGN.md §5). The rate-limit guard runs before
 * authentication and can't know who is asking, so routes with a per-person limit call this
 * once they do. Exceeding the limit answers 429 with Retry-After, like the guard.
 */
export async function hitUserLimit(
  store: RateLimitStore,
  rule: RateLimitRule,
  userId: string,
  response: Response,
): Promise<void> {
  const hit = await store.hit(`${rule.name}:user:${userId}`, rule.windowSec);
  if (hit.count > rule.limit) {
    response.setHeader('Retry-After', String(hit.resetInSec));
    throw new AppException('RATE_LIMITED');
  }
}
