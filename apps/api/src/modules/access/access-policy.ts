/**
 * Content access tiers (D7, ADR 0004): evaluated against the reader's membership type and status,
 * never their roles. Everything defaults to PUBLIC.
 */
export type AccessTier = 'PUBLIC' | 'MEMBERS' | 'TYPES';

/** Who is reading, as far as content access is concerned. */
export interface Viewer {
  /** Membership type of an active (not suspended, not expired) membership; null otherwise. */
  activeTypeId: string | null;
}

export const ANONYMOUS: Viewer = { activeTypeId: null };

export function canSee(
  viewer: Viewer,
  tier: AccessTier,
  allowedTypeIds: readonly string[],
): boolean {
  switch (tier) {
    case 'PUBLIC':
      return true;
    case 'MEMBERS':
      return viewer.activeTypeId !== null;
    case 'TYPES':
      return viewer.activeTypeId !== null && allowedTypeIds.includes(viewer.activeTypeId);
  }
}
