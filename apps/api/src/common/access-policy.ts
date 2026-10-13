/**
 * Who may see a piece of content (D7, ADR 0004; M16 plan §3): four settings, evaluated against
 * what the reader is, never their roles. Everything defaults to PUBLIC.
 *
 * - PUBLIC: everyone.
 * - VERIFIED: people the platform knows as physicians, in an organisation or not.
 * - MEMBERS: active members of the organisation that owns the item.
 * - TYPES: active members holding one of the membership types the item names.
 */
export type AccessTier = 'PUBLIC' | 'VERIFIED' | 'MEMBERS' | 'TYPES';

/** An active (not suspended, not expired) membership, in an organisation that is active. */
export interface ActiveMembership {
  organisationId: string;
  typeId: string;
}

/** Who is reading, as far as content access is concerned. */
export interface Viewer {
  /** The platform knows the person as a physician. */
  verified: boolean;
  /** At most one per organisation. */
  memberships: readonly ActiveMembership[];
}

export const ANONYMOUS: Viewer = { verified: false, memberships: [] };

/** What of an item decides who sees it. `organisationId` is null for the platform's own. */
export interface Tiered {
  accessTier: AccessTier;
  organisationId: string | null;
}

export function canSee(viewer: Viewer, item: Tiered, allowedTypeIds: readonly string[]): boolean {
  switch (item.accessTier) {
    case 'PUBLIC':
      return true;
    case 'VERIFIED':
      return viewer.verified;
    case 'MEMBERS':
      // The platform has no members: an item of nobody's with this setting opens to no one.
      return viewer.memberships.some((held) => held.organisationId === item.organisationId);
    case 'TYPES':
      return viewer.memberships.some((held) => allowedTypeIds.includes(held.typeId));
  }
}

/** The settings an item with that owner may carry: "members" needs an organisation. */
export function tierFitsOwner(tier: AccessTier, organisationId: string | null): boolean {
  return tier !== 'MEMBERS' || organisationId !== null;
}

/** Whether the person is an active member of that organisation. */
export function isMemberOf(viewer: Viewer, organisationId: string): boolean {
  return viewer.memberships.some((held) => held.organisationId === organisationId);
}

export const organisationsOf = (viewer: Viewer): string[] =>
  viewer.memberships.map((held) => held.organisationId);

export const typesOf = (viewer: Viewer): string[] => viewer.memberships.map((held) => held.typeId);
