import { normalizePassword } from '../../../infra/crypto/password-hasher';
import commonPasswords from './common-passwords.json';

/**
 * Password policy (NIST SP 800-63B style; SECURITY_MODEL.md §3): 12–128 characters, no
 * composition rules, and not a known breached/common password, a trivially repetitive string,
 * or something built from the email address. See COMMON_PASSWORDS_SOURCE.md for the list.
 */
export const PASSWORD_POLICY = { minLength: 12, maxLength: 128, minDistinctCharacters: 5 } as const;

export type PasswordProblem =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_COMMON'
  | 'PASSWORD_TOO_SIMPLE'
  | 'PASSWORD_CONTAINS_EMAIL';

const COMMON = new Set<string>(commonPasswords as string[]);

export function checkPassword(password: string, email?: string): PasswordProblem[] {
  const normalized = normalizePassword(password);
  const lower = normalized.toLowerCase();
  const length = [...normalized].length; // code points, so Hebrew and emoji count once each

  if (length < PASSWORD_POLICY.minLength) return ['PASSWORD_TOO_SHORT'];
  if (length > PASSWORD_POLICY.maxLength) return ['PASSWORD_TOO_LONG'];

  const problems: PasswordProblem[] = [];
  if (COMMON.has(lower)) problems.push('PASSWORD_TOO_COMMON');
  if (new Set(lower).size < PASSWORD_POLICY.minDistinctCharacters) {
    problems.push('PASSWORD_TOO_SIMPLE');
  }
  const localPart = email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    problems.push('PASSWORD_CONTAINS_EMAIL');
  }
  return problems;
}

export const COMMON_PASSWORD_COUNT = COMMON.size;
