/** What a verified person is known as (users.verified_as). */
export type VerifiedAs = 'SPECIALIST' | 'RESIDENT' | 'PHYSICIAN' | 'STUDENT';

/**
 * What a person an organisation accepts is known to the platform as (M17), from the membership
 * type: a specialist certificate means a specialist; the type keys RESIDENT and STUDENT mean
 * those; anything else a physician. The migration that added it filled it in the same way.
 */
export function verifiedAsFor(type: { key: string; identifier: string }): VerifiedAs {
  if (type.identifier === 'SPECIALIST_CERTIFICATE') return 'SPECIALIST';
  if (type.key === 'RESIDENT') return 'RESIDENT';
  if (type.key === 'STUDENT') return 'STUDENT';
  return 'PHYSICIAN';
}

/**
 * Whether the platform knows the person as verified now: verified, and its date (M17) not
 * passed. The hourly job clears a passed one; this keeps it closed in the meantime.
 */
export function verifiedNow(
  user: { verifiedAt: Date | null; verifiedUntil: Date | null },
  now = new Date(),
): boolean {
  return user.verifiedAt !== null && (user.verifiedUntil === null || user.verifiedUntil > now);
}

/** The mark shown beside a person's name (M17 plan §10): a student or a resident. */
export type PersonMark = 'STUDENT' | 'RESIDENT';
export const PERSON_MARKS = ['STUDENT', 'RESIDENT'] as const;

export function markOf(verifiedAs: VerifiedAs | null | undefined): PersonMark | null {
  return verifiedAs === 'STUDENT' || verifiedAs === 'RESIDENT' ? verifiedAs : null;
}
