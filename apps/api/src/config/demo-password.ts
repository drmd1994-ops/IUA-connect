/**
 * The demo's documented password (M2 plan §11 answer 4), shared by every fictional account on this
 * computer and in the browser tests. A hosted demo (M18) must not use it: it is written in the
 * code, so anyone who has read the repository knows it. There the seed takes DEMO_PASSWORD.
 */
export const DOCUMENTED_DEMO_PASSWORD = 'ilikeIUAconnect11';

/** The password the demo seed gives the fictional accounts. */
export function demoPassword(env: Record<string, string | undefined> = process.env): string {
  return env.DEMO_PASSWORD || DOCUMENTED_DEMO_PASSWORD;
}
