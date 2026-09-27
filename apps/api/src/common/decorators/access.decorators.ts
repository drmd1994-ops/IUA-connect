import { SetMetadata } from '@nestjs/common';
import { type PermissionKey } from '@iua/shared';

export const IS_PUBLIC_KEY = 'iua:isPublic';
export const IS_AUTHENTICATED_KEY = 'iua:isAuthenticated';
export const PERMISSIONS_KEY = 'iua:permissions';

/**
 * Every route must carry exactly one access declaration (deny by default, see PermissionGuard):
 * - @Public()               reachable without signing in;
 * - @Authenticated()        any signed-in user (their own account, sessions, MFA);
 * - @RequirePermission(...) a signed-in user holding all the given permissions.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Authenticated = () => SetMetadata(IS_AUTHENTICATED_KEY, true);

export const RequirePermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
