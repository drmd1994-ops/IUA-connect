/**
 * Which organisation a request is about, when it does not say (M16 plan §3, "One organisation
 * now, more later"). While the platform has a single organisation, the screens need not name
 * it: what a person asks about "the membership" can only mean that one. With more than one, a
 * person who belongs to exactly one still means that one. Anything else must be said.
 *
 * No part of this decides what anyone may see or do. It only fills in an unnamed organisation,
 * and the caller then applies its own checks to the answer.
 */
export function organisationMeant(input: {
  /** The organisation the request named, if it named one. */
  named: string | null;
  /** The active organisations on the platform. */
  active: readonly string[];
  /** The organisations the person holds a membership in, of any state. */
  mine: readonly string[];
}): { id: string } | { problem: 'unknown' | 'unsaid' } {
  if (input.named !== null) {
    return input.active.includes(input.named) ? { id: input.named } : { problem: 'unknown' };
  }
  const [only, ...others] = input.active;
  if (only !== undefined && others.length === 0) return { id: only };
  const [mine, ...more] = input.mine.filter((id) => input.active.includes(id));
  if (mine !== undefined && more.length === 0) return { id: mine };
  return { problem: 'unsaid' };
}
