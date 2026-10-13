import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from '@iua/shared';

export const IS_PUBLIC_KEY = 'iua:isPublic';
export const IS_AUTHENTICATED_KEY = 'iua:isAuthenticated';
export const PERMISSIONS_KEY = 'iua:permissions';
export const ANY_PERMISSIONS_KEY = 'iua:anyPermissions';
export const SCOPED_PERMISSIONS_KEY = 'iua:scopedPermissions';
export const ANY_SCOPED_PERMISSIONS_KEY = 'iua:anyScopedPermissions';

/**
 * Every route must carry exactly one access declaration (deny by default, see PermissionGuard):
 * - @Public()               reachable without signing in;
 * - @Authenticated()        any signed-in user (their own account, sessions, MFA);
 * - @RequirePermission(...) a signed-in user holding all the given permissions;
 * - @RequireAnyPermission(...) a signed-in user holding at least one of them (a screen that
 *   shows each person their own part, such as the admin dashboard).
 *
 * The two above ask about the platform only: a permission held inside an organisation never
 * satisfies them. For routes about things an organisation can own (M16):
 * - @RequireScopedPermission(...) a signed-in user holding each of the permissions somewhere,
 *   on the platform or in an organisation. **The handler must then check the owner** of what
 *   it touches (`scopeOf`, `mayActOn`, `ownedWhere`); the guard cannot know it.
 * - @RequireAnyScopedPermission(...) the same, for at least one of them.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);

export const RequirePermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
export const RequireScopedPermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(SCOPED_PERMISSIONS_KEY, permissions);
export const RequireAnyScopedPermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(ANY_SCOPED_PERMISSIONS_KEY, permissions);
