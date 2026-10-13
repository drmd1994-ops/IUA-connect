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
  /** The roles held on the platform. Roles held inside an organisation are not among them. */
  roles: readonly string[];
  /** What the person may do on the platform: from the roles they hold there. */
  permissions: ReadonlySet<PermissionKey>;
  /**
   * What the person may do inside each organisation they are staff of (M16). Kept apart from
   * the platform's on purpose: a check that reads only `permissions` never opens anything to an
   * organisation's staff. See `scope.ts` for the questions to ask.
   */
  organisationPermissions: ReadonlyMap<string, ReadonlySet<PermissionKey>>;
  /** Known to the platform as a physician (M16). The key to the platform's members' parts. */
  verified: boolean;
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
