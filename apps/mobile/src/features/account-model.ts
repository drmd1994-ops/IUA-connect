/**
 * What the account screens decide without the phone or the server: which parts of a profile
 * were changed, and how a list of choices is ticked.
 */

/** Adds a value to a list of choices, or takes it out. */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((other) => other !== value) : [...values, value];
}

/** An empty text box means "nothing": the API keeps null, not an empty text. */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Only what the person changed is sent, so that saving one field never overwrites another that
 * was changed elsewhere meanwhile. Lists are compared by what they hold, not by order.
 */
export function changedFields<T extends Record<string, unknown>>(before: T, after: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (!same(before[key], after[key])) changed[key] = after[key];
  }
  return changed;
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => same(left[key], right[key]));
  }
  return a === b;
}

/** The languages a profile can list (ISO 639-1), in the order the site offers them. */
export const PROFILE_LANGUAGES = [
  'he',
  'en',
  'ar',
  'ru',
  'am',
  'fr',
  'es',
  'de',
  'ro',
  'it',
  'pt',
  'uk',
] as const;

/** An authenticator's secret in groups of four, as such keys are usually written. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}
