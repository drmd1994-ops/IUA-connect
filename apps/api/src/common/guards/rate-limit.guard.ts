import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request, type Response } from 'express';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { RateLimitStore } from '../../infra/rate-limit/rate-limit.store';
import {
  RATE_LIMITS,
  RATE_LIMIT_KEY,
  type RateLimitRule,
} from '../decorators/rate-limit.decorator';
import { AppException } from '../errors/app.exception';

/** The account a request targets, hashed so raw emails/tokens never become map keys. */
function accountKey(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const raw = body?.email ?? body?.mfaToken;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return createHash('sha256').update(raw.trim().toLowerCase()).digest('base64url');
}

/**
 * Pipeline step 3 (ARCHITECTURE.md §3), before authentication: the global per-IP limit on every
 * route, plus any @RateLimit rules. Exceeding a limit returns 429 with Retry-After.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly store?: RateLimitStore,
    @Optional() @Inject(APP_CONFIG) private readonly env?: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.store || context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const rules = [
      RATE_LIMITS.global as RateLimitRule,
      ...(this.reflector.get<RateLimitRule[] | undefined>(RATE_LIMIT_KEY, context.getHandler()) ??
        []),
    ];

    for (const rule of rules) {
      // Per-person limits are counted by the route, after authentication.
      if (rule.by === 'user') continue;
      const subject = rule.by === 'ip' ? (request.ip ?? 'unknown') : accountKey(request);
      if (!subject) continue;
      const scope = rule === RATE_LIMITS.global ? 'all' : route;
      const hit = await this.store.hit(`${rule.name}:${scope}:${subject}`, rule.windowSec);
      // The scale is 1 except in automated test runs (refused in production).
      if (hit.count > rule.limit * (this.env?.RATE_LIMIT_SCALE ?? 1)) {
        response.setHeader('Retry-After', String(hit.resetInSec));
        throw new AppException('RATE_LIMITED');
      }
    }
    return true;
  }
}
