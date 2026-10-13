import { describe, expect, it } from 'vitest';
import { PERMISSIONS, PERMISSION_LEVELS, countsInOrganisation } from './permissions';
import { ROLES, ROLE_KEYS, roleFits } from './roles';

describe('role catalogue', () => {
  it('only references known permissions', () => {
    for (const key of ROLE_KEYS) {
      for (const permission of ROLES[key].permissions) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('gives the super admin every permission', () => {
    expect([...ROLES.SUPER_ADMIN.permissions].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('requires MFA for every administrative role (SECURITY_MODEL.md §3)', () => {
    for (const key of ROLE_KEYS) expect(ROLES[key].requiresMfa).toBe(true);
  });

  it('scopes the department director to a department', () => {
    expect(ROLES.DEPARTMENT_DIRECTOR.scope).toBe('DEPARTMENT');
  });

  it('says of every permission where it means something', () => {
    expect(Object.keys(PERMISSION_LEVELS).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('gives an organisation’s admin nothing that is the platform’s', () => {
    for (const permission of ROLES.ORG_ADMIN.permissions) {
      expect(countsInOrganisation(permission)).toBe(true);
    }
  });

  it('does not let the platform’s admin reach into an organisation', () => {
    const held: readonly string[] = ROLES.PLATFORM_ADMIN.permissions;
    expect(held).not.toContain('organisations.access');
    expect(held).not.toContain('membership.manage');
    expect(held).not.toContain('membership.read');
  });

  it('knows where each role may be held', () => {
    expect(roleFits('SUPER_ADMIN', false)).toBe(true);
    expect(roleFits('SUPER_ADMIN', true)).toBe(false);
    expect(roleFits('ORG_ADMIN', true)).toBe(true);
    expect(roleFits('ORG_ADMIN', false)).toBe(false);
    expect(roleFits('CONTENT_EDITOR', true)).toBe(true);
    expect(roleFits('CONTENT_EDITOR', false)).toBe(true);
    expect(roleFits('DEPARTMENT_DIRECTOR', true)).toBe(false);
  });
});
