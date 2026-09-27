import { ApiError } from '@iua/api-client';

type Translate = (key: string) => string;

/**
 * The translated message for an error. API errors carry an i18n key (API_DESIGN.md §2); anything
 * else (network failure, a bug) gets the generic message.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    try {
      return t(error.messageKey);
    } catch {
      return t('errors.internal');
    }
  }
  return t('errors.internal');
}

/** Password-policy problems from a VALIDATION_FAILED error, as auth.passwordProblems.* keys. */
export function passwordProblems(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return [];
  return error.details
    .filter((detail) => detail.field === 'password' && detail.code.startsWith('PASSWORD_'))
    .map((detail) => `auth.passwordProblems.${detail.code}`);
}

export function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
