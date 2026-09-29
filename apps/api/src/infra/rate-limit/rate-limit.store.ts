import { Injectable, type OnModuleDestroy } from '@nestjs/common';

export interface RateLimitHit {
  /** Requests counted in the current window, including this one. */
  count: number;
  /** Seconds until the window resets. */
  resetInSec: number;
}

/**
 * Rate-limit counters (ARCHITECTURE.md §5). Demo: in memory (per API process). A Redis store is
 * needed before running more than one API instance; select it with RATE_LIMIT_STORE.
 */
export abstract class RateLimitStore {
  abstract hit(key: string, windowSec: number): Promise<RateLimitHit>;
}

/** Fixed-window counters in a Map; expired windows are swept once a minute. */
@Injectable()
export class MemoryRateLimitStore extends RateLimitStore implements OnModuleDestroy {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private readonly sweeper = setInterval(() => this.sweep(), 60_000).unref();

  async hit(key: string, windowSec: number, now = Date.now()): Promise<RateLimitHit> {
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowSec * 1000 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return { count: window.count, resetInSec: Math.ceil((window.resetAt - now) / 1000) };
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  private sweep(now = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}
