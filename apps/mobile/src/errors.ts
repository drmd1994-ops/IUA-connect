import { ApiError } from '@iua/api-client';

type Translate = ((key: string) => string) & { has?: (key: string) => boolean };

/**
 * The translated message for an error, as on the site: the API names a text key, and often a
 * detail that says exactly what went wrong. Anything else (no network, a bug) gets the general
 * message.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    for (const detail of error.details) {
      const key = `errors.details.${detail.code}`;
      if (t.has?.(key)) return t(key);
    }
    if (t.has?.(error.messageKey)) return t(error.messageKey);
  }
  return t('errors.internal');
}
