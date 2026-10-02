import { disableProblem, manageProblem, roleChangeProblem } from './account-rules';

const admin = { userId: 'admin', roles: ['IUA_ADMIN'] };
const superAdmin = { userId: 'super', roles: ['SUPER_ADMIN'] };
const otherSuper = { userId: 'super-2', roles: ['SUPER_ADMIN'] };
const member = { userId: 'member', roles: [] };
const editor = { userId: 'editor', roles: ['CONTENT_EDITOR'] };

describe('account rules', () => {
  it('nobody disables or manages their own account here', () => {
    expect(disableProblem(admin, admin, 2)).toBe('accountSelf');
    expect(manageProblem(admin, admin)).toBe('accountSelf');
    expect(disableProblem(admin, member, 2)).toBeNull();
    expect(manageProblem(admin, editor)).toBeNull();
  });

  it('only a super admin acts on a super admin', () => {
    expect(disableProblem(admin, superAdmin, 2)).toBe('accountSuperAdmin');
    expect(manageProblem(admin, superAdmin)).toBe('accountSuperAdmin');
    expect(disableProblem(otherSuper, superAdmin, 2)).toBeNull();
    expect(manageProblem(otherSuper, superAdmin)).toBeNull();
  });

  it('never disables the last super admin', () => {
    expect(disableProblem(otherSuper, superAdmin, 1)).toBe('accountLastSuperAdmin');
  });
});

describe('role rules', () => {
  it('nobody changes their own roles', () => {
    expect(roleChangeProblem('grant', 'CONTENT_EDITOR', superAdmin, superAdmin, 2)).toBe(
      'accountSelf',
    );
    expect(roleChangeProblem('remove', 'SUPER_ADMIN', superAdmin, superAdmin, 2)).toBe(
      'accountSelf',
    );
  });

  it('gives and removes unscoped roles', () => {
    expect(roleChangeProblem('grant', 'CONTENT_EDITOR', superAdmin, member, 1)).toBeNull();
    expect(roleChangeProblem('grant', 'SUPER_ADMIN', superAdmin, member, 1)).toBeNull();
    expect(roleChangeProblem('remove', 'CONTENT_EDITOR', superAdmin, editor, 1)).toBeNull();
    expect(roleChangeProblem('remove', 'SUPER_ADMIN', superAdmin, otherSuper, 2)).toBeNull();
  });

  it('never removes the last super admin', () => {
    expect(roleChangeProblem('remove', 'SUPER_ADMIN', superAdmin, otherSuper, 1)).toBe(
      'accountLastSuperAdmin',
    );
  });

  it('leaves scoped roles to the screen where the scope is chosen', () => {
    expect(roleChangeProblem('grant', 'DEPARTMENT_DIRECTOR', superAdmin, member, 1)).toBe(
      'roleScoped',
    );
    expect(roleChangeProblem('grant', 'SUBSPECIALTY_ADMIN', superAdmin, member, 1)).toBe(
      'roleScoped',
    );
  });

  it('refuses a role that does not exist', () => {
    expect(roleChangeProblem('grant', 'EMPEROR', superAdmin, member, 1)).toBe('roleUnknown');
    expect(roleChangeProblem('grant', 'constructor', superAdmin, member, 1)).toBe('roleUnknown');
  });
});
