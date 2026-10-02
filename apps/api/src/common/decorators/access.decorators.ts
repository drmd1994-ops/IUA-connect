import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from '@iua/shared';

export const IS_PUBLIC_KEY = 'iua:isPublic';
export const IS_AUTHENTICATED_KEY = 'iua:isAuthenticated';
export const PERMISSIONS_KEY = 'iua:permissions';
export const ANY_PERMISSIONS_KEY = 'iua:anyPermissions';

/**
 * Every route must carry exactly one access declaration (deny by default, see PermissionGuard):
 * - @Public()               reachable without signing in;
 * - @Authenticated()        any signed-in user (their own account, sessions, MFA);
 * - @RequirePermission(...) a signed-in user holding all the given permissions;
 * - @RequireAnyPermission(...) a signed-in user holding at least one of them (a screen that
 *   shows each person their own part, such as the admin dashboard).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);

export const RequirePermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
