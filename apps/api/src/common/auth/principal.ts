import { type PermissionKey } from '@iua/shared';

/**
 * The authenticated caller, attached to the request by the authentication guard (M1).
 * Permissions are resolved server-side from roles on every request, never read from the token.
 */
export interface Principal {
  userId: string;
  sessionId: string;
  mfa: boolean;
  permissions: ReadonlySet<PermissionKey>;
}

export interface RequestWithPrincipal {
  principal?: Principal;
}
