import { type PermissionKey } from '@iua/shared';
import { AppException } from '../errors/app.exception';

/**
 * The authenticated caller, resolved from the access token and its session on every request.
 * Permissions come from the user's roles in the database, never from the token, so revoking a
 * role or a session takes effect immediately.
 */
export interface Principal {
  userId: string;
  sessionId: string;
  /** MFA completed in this session. Permissions of MFA-requiring roles apply only when true. */
  mfa: boolean;
  roles: readonly string[];
  permissions: ReadonlySet<PermissionKey>;
  /** Holds a role that requires MFA but has no confirmed factor yet: must enrol first. */
  mfaEnrollmentRequired: boolean;
}

export interface RequestWithPrincipal {
  principal?: Principal | null;
}

/**
 * Resolves the caller of a request (implemented by the auth module). Returns null for anonymous
 * requests and for invalid, expired or revoked credentials — it never throws for those.
 */
export abstract class PrincipalResolver {
  abstract resolve(request: object): Promise<Principal | null>;
}

/** The principal on an @Authenticated or @RequirePermission route (the guard guarantees it). */
export function principalOf(req: RequestWithPrincipal): Principal {
  if (!req.principal) throw new AppException('UNAUTHENTICATED');
  return req.principal;
}
