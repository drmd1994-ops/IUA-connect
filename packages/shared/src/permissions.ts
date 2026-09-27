/**
 * Permission keys (ARCHITECTURE.md §6). Routes declare them with `@RequirePermission(...)`.
 * The mapping from roles to permissions is seeded from code in M1 (Identity); until then no
 * principal holds any permission, so every non-public route is denied.
 */
export const PERMISSIONS = [
  'users.read',
  'users.manage',
  'roles.manage',
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
  'guidelines.manage',
  'files.upload',
  'broadcasts.create',
  'broadcasts.approve',
  'audit.read',
  'settings.manage',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}
