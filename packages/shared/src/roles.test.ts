import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permissions';
import { ROLES, ROLE_KEYS } from './roles';

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
});
