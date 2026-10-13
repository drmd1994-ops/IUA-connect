import { type PermissionKey } from '@iua/shared';
import { type Principal } from './principal';

/**
 * Where a member of staff may use one permission (M16 plan §3, "Staff"; §5, "An organisation
 * sees only its own"). A role is held on the platform or inside an organisation, so "may this
 * person publish news?" has no answer until one asks "whose news?".
 */
export interface StaffScope {
  /** The platform's own things: those that belong to no organisation. */
  platform: boolean;
  /** Every organisation's things as well: platform staff with `organisations.access`. */
  everywhere: boolean;
  /** The organisations in which the person holds the permission themselves. */
  organisationIds: readonly string[];
}

export function scopeOf(principal: Principal, permission: PermissionKey): StaffScope {
  const platform = principal.permissions.has(permission);
  const organisationIds: string[] = [];
  for (const [organisationId, held] of principal.organisationPermissions) {
    if (held.has(permission)) organisationIds.push(organisationId);
  }
  return {
    platform,
    everywhere: platform && principal.permissions.has('organisations.access'),
    organisationIds,
  };
}

/** Holds the permission somewhere: on the platform, or in at least one organisation. */
export function holdsAnywhere(principal: Principal, permission: PermissionKey): boolean {
  if (principal.permissions.has(permission)) return true;
  for (const held of principal.organisationPermissions.values()) {
    if (held.has(permission)) return true;
  }
  return false;
}

/**
 * Whether the scope covers a thing owned by that organisation, or by the platform (null).
 * Platform staff cover an organisation's thing only through `organisations.access`.
 */
export function covers(scope: StaffScope, organisationId: string | null): boolean {
  if (organisationId === null) return scope.platform;
  return scope.everywhere || scope.organisationIds.includes(organisationId);
}

/** Whether the person may use the permission on a thing with that owner. */
export function mayActOn(
  principal: Principal,
  permission: PermissionKey,
  organisationId: string | null,
): boolean {
  return covers(scopeOf(principal, permission), organisationId);
}

/** Reached an organisation's thing as platform staff, not as that organisation's own staff. */
export function reachedIn(scope: StaffScope, organisationId: string | null): boolean {
  return (
    organisationId !== null && scope.everywhere && !scope.organisationIds.includes(organisationId)
  );
}

export type OwnerFilter =
  | Record<string, never>
  | { OR: ({ organisationId: null } | { organisationId: { in: string[] } })[] };

/**
 * A database filter for the things the scope covers, for tables whose rows belong to an
 * organisation or to the platform (`organisation_id` empty). Covers nothing: matches nothing.
 */
export function ownedWhere(scope: StaffScope): OwnerFilter {
  if (scope.everywhere) return {};
  return {
    OR: [
      ...(scope.platform ? [{ organisationId: null } as const] : []),
      { organisationId: { in: [...scope.organisationIds] } },
    ],
  };
}

/**
 * The same for tables whose rows always belong to an organisation (memberships): the platform
 * owns none of them, so platform staff see them only through `organisations.access`.
 */
export function organisationWhere(
  scope: StaffScope,
): Record<string, never> | { organisationId: { in: string[] } } {
  if (scope.everywhere) return {};
  return { organisationId: { in: [...scope.organisationIds] } };
}

/**
 * The one owner a new thing gets when the request does not name it: the person's only
 * organisation for this permission, or the platform when they hold it only there. More than
 * one possibility must be said, so nothing lands in the wrong place by a guess.
 */
export function ownerOfNew(
  scope: StaffScope,
  named: string | null | undefined,
): { organisationId: string | null } | { problem: 'unsaid' | 'notYours' } {
  if (named !== undefined) {
    return covers(scope, named) ? { organisationId: named } : { problem: 'notYours' };
  }
  const [only, ...others] = scope.organisationIds;
  if (only !== undefined && others.length === 0 && !scope.platform) return { organisationId: only };
  if (only === undefined && scope.platform) return { organisationId: null };
  return { problem: only === undefined ? 'notYours' : 'unsaid' };
}

/** The widest of several scopes: for a route that any one of several permissions opens. */
export function scopeOfAny(
  principal: Principal,
  permissions: readonly PermissionKey[],
): StaffScope {
  const scopes = permissions.map((permission) => scopeOf(principal, permission));
  return {
    platform: scopes.some((scope) => scope.platform),
    everywhere: scopes.some((scope) => scope.everywhere),
    organisationIds: [...new Set(scopes.flatMap((scope) => scope.organisationIds))],
  };
}

/**
 * The permissions the person may use on a thing with that owner: for workflows that ask about
 * several at once (who may submit, review, publish).
 */
export function permissionsOn(
  principal: Principal,
  organisationId: string | null,
): ReadonlySet<PermissionKey> {
  if (organisationId === null) return principal.permissions;
  const held = new Set(principal.organisationPermissions.get(organisationId) ?? []);
  if (principal.permissions.has('organisations.access')) {
    for (const permission of principal.permissions) held.add(permission);
  }
  return held;
}

/** The problem of `ownerOfNew`, as the error a request gets. */
export const OWNER_PROBLEM_CODES = {
  unsaid: 'organisationRequired',
  notYours: 'unknownOrganisation',
} as const;

/**
 * The organisation a new thing goes to, for things that always belong to one (a batch of
 * imported members): the one named, when the person may act there; left unsaid, the only
 * organisation they hold the permission in themselves. Platform staff who reach organisations
 * say which.
 */
export function organisationOfNew(
  scope: StaffScope,
  named: string | undefined,
): { organisationId: string } | { problem: 'unsaid' | 'notYours' } {
  if (named !== undefined) {
    return covers(scope, named) ? { organisationId: named } : { problem: 'notYours' };
  }
  const [only, ...others] = scope.organisationIds;
  if (only !== undefined && others.length === 0) return { organisationId: only };
  return { problem: only === undefined && !scope.everywhere ? 'notYours' : 'unsaid' };
}

/** Holds the permission nowhere. */
export const coversNothing = (scope: StaffScope): boolean =>
  !scope.platform && !scope.everywhere && scope.organisationIds.length === 0;

/**
 * The part of a scope that is about one owner: an organisation, or the platform's own things
 * (`'platform'`). For a screen that shows one owner's numbers at a time. An owner the scope
 * does not cover leaves nothing.
 */
export function narrowTo(scope: StaffScope, owner: string | undefined): StaffScope {
  if (owner === undefined) return scope;
  if (owner === 'platform')
    return { platform: scope.platform, everywhere: false, organisationIds: [] };
  return {
    platform: false,
    everywhere: false,
    organisationIds: covers(scope, owner) ? [owner] : [],
  };
}
