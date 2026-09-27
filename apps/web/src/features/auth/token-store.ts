/**
 * The access token lives here, in memory only (ARCHITECTURE.md §9): not in React state (it isn't
 * UI), not in storage (XSS could read it). Only the browser writes to it — from effects and event
 * handlers — so server rendering never sees a value.
 */
let accessToken: string | undefined;
let refreshing: Promise<boolean> | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = undefined;
  },
  /** Runs at most one refresh at a time; concurrent callers share the result. */
  refreshOnce(run: () => Promise<boolean>): Promise<boolean> {
    refreshing ??= run().finally(() => {
      refreshing = null;
    });
    return refreshing;
  },
};
