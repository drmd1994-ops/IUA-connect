import { ROLES, type RoleKey, roleFits } from '@medconnect/shared';

/**
 * Rules for managing accounts and roles (M8 plan §2.2–2.3, §3). They exist so that no single
 * action locks everyone out of the admin area, and so that an account can't raise its own power.
 */
export type AccountProblem =
  /** Nobody disables themselves, ends their own sessions here, or changes their own roles. */
  | 'accountSelf'
  /** Only a super admin acts on a super admin's account. */
  | 'accountSuperAdmin'
  /** The last super admin can't be disabled or lose the role. */
  | 'accountLastSuperAdmin'
  /** Roles tied to a department or subspecialty are assigned where that is chosen. */
  | 'roleScoped'
  /** The role is not held there: a platform role in an organisation, or the other way (M16). */
  | 'roleWrongPlace'
  | 'roleUnknown';

export interface Actor {
  userId: string;
  roles: readonly string[];
}

export interface Target {
  userId: string;
  roles: readonly string[];
}

const isSuperAdmin = (roles: readonly string[]) => roles.includes('SUPER_ADMIN');

/** Whether the actor may disable the target, or end its sessions. */
export function disableProblem(
  actor: Actor,
  target: Target,
  activeSuperAdmins: number,
): AccountProblem | null {
  if (actor.userId === target.userId) return 'accountSelf';
  if (isSuperAdmin(target.roles)) {
    if (!isSuperAdmin(actor.roles)) return 'accountSuperAdmin';
    if (activeSuperAdmins <= 1) return 'accountLastSuperAdmin';
  }
  return null;
}

/** Whether the actor may enable, unlock or end the sessions of the target. */
export function manageProblem(actor: Actor, target: Target): AccountProblem | null {
  if (actor.userId === target.userId) return 'accountSelf';
  if (isSuperAdmin(target.roles) && !isSuperAdmin(actor.roles)) return 'accountSuperAdmin';
  return null;
}

export function isRoleKey(value: string): value is RoleKey {
  return Object.prototype.hasOwnProperty.call(ROLES, value);
}

/**
 * Whether a role can be given or removed on the account page, on the platform or (when
 * `inOrganisation`) inside an organisation.
 */
export function roleChangeProblem(
  change: 'grant' | 'remove',
  role: string,
  actor: Actor,
  target: Target,
  activeSuperAdmins: number,
  inOrganisation = false,
): AccountProblem | null {
  if (!isRoleKey(role)) return 'roleUnknown';
  if (ROLES[role].scope !== 'NONE') return 'roleScoped';
  if (change === 'grant' && !roleFits(role, inOrganisation)) return 'roleWrongPlace';
  if (actor.userId === target.userId) return 'accountSelf';
  if (
    change === 'remove' &&
    !inOrganisation &&
    role === 'SUPER_ADMIN' &&
    isSuperAdmin(target.roles) &&
    activeSuperAdmins <= 1
  ) {
    return 'accountLastSuperAdmin';
  }
  return null;
}
