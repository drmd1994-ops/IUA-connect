import { PERMISSIONS, type PermissionKey } from './permissions';

/**
 * Administrative roles (ADR 0004: separate from membership type). Seeded from this catalogue by
 * the reference seed layer. `requiresMfa`: the role's permissions are granted only in a session
 * that completed MFA, and holders must enrol in MFA (SECURITY_MODEL.md §3).
 */
export const ROLE_SCOPE_TYPES = ['NONE', 'DEPARTMENT', 'SUBSPECIALTY'] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];

/**
 * Where a role is held (M16 plan §3): on the platform, inside one organisation, or either. A
 * person may hold the same role in several places.
 */
export type RoleLevel = 'platform' | 'organisation' | 'either';

interface RoleDefinition {
  permissions: readonly PermissionKey[];
  requiresMfa: boolean;
  scope: RoleScopeType;
  level: RoleLevel;
}

/** What an organisation's own staff may do in its section. */
const ORGANISATION_PERMISSIONS = [
  'membership.read',
  'membership.manage',
  'membership.approve.final',
  'news.create',
  'news.review',
  'news.publish',
  'events.manage',
  'files.upload',
  'broadcasts.create',
  'broadcasts.approve',
  'chat.moderate',
  'chat.rooms.manage',
  'positions.manage',
  'positions.review',
] as const satisfies readonly PermissionKey[];

export const ROLES = {
  /** Everything, everywhere, including inside every organisation. */
  SUPER_ADMIN: { permissions: PERMISSIONS, requiresMfa: true, scope: 'NONE', level: 'platform' },
  /**
   * Runs the platform: accounts, institutions, the education library, guidelines, the
   * platform's own news, events, rooms and messages. Does not reach into an organisation: it
   * has no `organisations.access`.
   */
  PLATFORM_ADMIN: {
    permissions: [
      'users.read',
      'users.manage',
      'organisations.manage',
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
      'positions.manage',
      'positions.review',
      'communities.manage',
      'journalclub.manage',
      'audit.read',
    ],
    requiresMfa: true,
    scope: 'NONE',
    level: 'platform',
  },
  /** Runs one organisation's section: its members, news, events, rooms and messages. */
  ORG_ADMIN: {
    permissions: ORGANISATION_PERMISSIONS,
    requiresMfa: true,
    scope: 'NONE',
    level: 'organisation',
  },
  /** Writes news, for the platform or for an organisation; on the platform, education too. */
  CONTENT_EDITOR: {
    permissions: ['news.create', 'education.manage', 'journalclub.manage', 'files.upload'],
    requiresMfa: true,
    scope: 'NONE',
    level: 'either',
  },
  EVENT_ADMIN: {
    permissions: ['events.manage', 'files.upload'],
    requiresMfa: true,
    scope: 'NONE',
    level: 'either',
  },
  /**
   * Checks that a person is a physician (against the Ministry of Health's public register) or a
   * medical student (from their school's confirmation), on the platform (M17). Nothing else.
   */
  VERIFIER: {
    permissions: ['physicians.verify'],
    requiresMfa: true,
    scope: 'NONE',
    level: 'platform',
  },
  DEPARTMENT_DIRECTOR: {
    permissions: ['membership.approve.department', 'positions.post.department'],
    requiresMfa: true,
    scope: 'DEPARTMENT',
    level: 'platform',
  },
  // Permissions for these roles arrive with their Phase 2 features.
  RESEARCH_ADMIN: { permissions: [], requiresMfa: true, scope: 'NONE', level: 'platform' },
  /** Writes and publishes journal club entries for the subspecialties they are appointed to. */
  SUBSPECIALTY_ADMIN: {
    permissions: ['journalclub.subspecialty'],
    requiresMfa: true,
    scope: 'SUBSPECIALTY',
    level: 'platform',
  },
  CME_ADMIN: { permissions: [], requiresMfa: true, scope: 'NONE', level: 'either' },
} as const satisfies Record<string, RoleDefinition>;

export type RoleKey = keyof typeof ROLES;

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

/** Whether a role may be held in that place: on the platform (no organisation) or in one. */
export function roleFits(role: RoleKey, inOrganisation: boolean): boolean {
  const level: RoleLevel = ROLES[role].level;
  return level === 'either' || level === (inOrganisation ? 'organisation' : 'platform');
}
