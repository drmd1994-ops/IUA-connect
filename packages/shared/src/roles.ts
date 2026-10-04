import { PERMISSIONS, type PermissionKey } from './permissions';

/**
 * Administrative roles (ADR 0004: separate from membership type). Seeded from this catalogue by
 * the reference seed layer. `requiresMfa`: the role's permissions are granted only in a session
 * that completed MFA, and holders must enrol in MFA (SECURITY_MODEL.md §3).
 */
export const ROLE_SCOPE_TYPES = ['NONE', 'DEPARTMENT', 'SUBSPECIALTY'] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];

interface RoleDefinition {
  permissions: readonly PermissionKey[];
  requiresMfa: boolean;
  scope: RoleScopeType;
}

export const ROLES = {
  SUPER_ADMIN: { permissions: PERMISSIONS, requiresMfa: true, scope: 'NONE' },
  IUA_ADMIN: {
    permissions: [
      'users.read',
      'users.manage',
      'membership.read',
      'membership.manage',
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
      'audit.read',
    ],
    requiresMfa: true,
    scope: 'NONE',
  },
  CONTENT_EDITOR: {
    permissions: ['news.create', 'education.manage', 'files.upload'],
    requiresMfa: true,
    scope: 'NONE',
  },
  EVENT_ADMIN: { permissions: ['events.manage', 'files.upload'], requiresMfa: true, scope: 'NONE' },
  DEPARTMENT_DIRECTOR: {
    permissions: ['membership.approve.department'],
    requiresMfa: true,
    scope: 'DEPARTMENT',
  },
  // Permissions for these roles arrive with their Phase 2 features.
  RESEARCH_ADMIN: { permissions: [], requiresMfa: true, scope: 'NONE' },
  SUBSPECIALTY_ADMIN: { permissions: [], requiresMfa: true, scope: 'SUBSPECIALTY' },
  CME_ADMIN: { permissions: [], requiresMfa: true, scope: 'NONE' },
} as const satisfies Record<string, RoleDefinition>;

export type RoleKey = keyof typeof ROLES;

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];
