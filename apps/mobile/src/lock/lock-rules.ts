/** After this long in the background the app asks for the fingerprint or face again. */
export const RELOCK_AFTER_MS = 60 * 1000;

/**
 * Whether the app locks itself when it comes back to the front: it was in the background (not
 * merely covered for a moment by the phone's own dialog) for longer than a minute.
 */
export function shouldLock(leftAt: number | null, now: number): boolean {
  return leftAt !== null && now - leftAt >= RELOCK_AFTER_MS;
}
