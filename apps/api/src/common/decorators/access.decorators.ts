import { SetMetadata, applyDecorators } from '@nestjs/common';
import { type PermissionKey } from '@iua/shared';

export const IS_PUBLIC_KEY = 'iua:isPublic';
export const PERMISSIONS_KEY = 'iua:permissions';

/**
 * Marks a route (or every route of a controller) as reachable without authentication.
 * Every route must carry either @Public() or @RequirePermission(); see PermissionGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires an authenticated principal holding all of the given permissions. */
export const RequirePermission = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions));
