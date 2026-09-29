/**
 * Permission keys (ARCHITECTURE.md §6). Routes declare them with `@RequirePermission(...)`.
 * Roles map to permissions in `roles.ts`; the reference seed writes that mapping to the database.
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
