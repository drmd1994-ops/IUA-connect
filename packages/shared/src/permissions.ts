/**
 * Permission keys (ARCHITECTURE.md §6). Routes declare them with `@RequirePermission(...)`.
 * Roles map to permissions in `roles.ts`; the reference seed writes that mapping to the database.
 */
export const PERMISSIONS = [
  'users.read',
  'users.manage',
  'roles.manage',
  'organisations.manage',
  'organisations.access',
  'membership.read',
  'membership.manage',
  'membership.approve.department',
  'membership.approve.final',
  'institutions.manage',
  'news.create',
  'news.review',
  'news.publish',
  'events.manage',
  'education.manage',
  'education.review',
  'guidelines.manage',
  'files.upload',
  'broadcasts.create',
  'broadcasts.approve',
  'chat.moderate',
  'chat.rooms.manage',
  'audit.read',
  'settings.manage',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Where a permission means something (M16 plan §3, "Staff"). A role is held on the platform or
 * inside one organisation, and a permission counts only where it has a meaning:
 *
 * - `platform`: about the platform itself (accounts, the education library, settings). Held in
 *   an organisation it gives nothing.
 * - `organisation`: about an organisation's own things (its members). There is no platform
 *   membership, so held on the platform it gives nothing by itself.
 * - `both`: about things that the platform and an organisation can each own (news, events,
 *   rooms). Held on the platform it covers the platform's own; held in an organisation, that
 *   organisation's.
 *
 * Platform staff reach into an organisation's things only with `organisations.access`, a named
 * permission of its own; with it, what they hold on the platform also counts inside every
 * organisation.
 */
export type PermissionLevel = 'platform' | 'organisation' | 'both';

export const PERMISSION_LEVELS = {
  'users.read': 'platform',
  'users.manage': 'platform',
  'roles.manage': 'platform',
  'organisations.manage': 'platform',
  'organisations.access': 'platform',
  'membership.read': 'organisation',
  'membership.manage': 'organisation',
  // A director answers for a hospital department, whichever organisation the applicant chose.
  'membership.approve.department': 'platform',
  'membership.approve.final': 'organisation',
  'institutions.manage': 'platform',
  'news.create': 'both',
  'news.review': 'both',
  'news.publish': 'both',
  'events.manage': 'both',
  'education.manage': 'platform',
  'education.review': 'platform',
  'guidelines.manage': 'platform',
  'files.upload': 'both',
  'broadcasts.create': 'both',
  'broadcasts.approve': 'both',
  'chat.moderate': 'both',
  'chat.rooms.manage': 'both',
  'audit.read': 'platform',
  'settings.manage': 'platform',
} as const satisfies Record<PermissionKey, PermissionLevel>;

/** Whether a permission held inside an organisation gives anything there. */
export function countsInOrganisation(permission: PermissionKey): boolean {
  return PERMISSION_LEVELS[permission] !== 'platform';
}
