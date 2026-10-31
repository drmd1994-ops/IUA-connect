import { ApiError } from '@medconnect/api-client';

type Translate = ((key: string, values?: Record<string, string>) => string) & {
  has?: (key: string) => boolean;
};

/**
 * The translated message for an error, as on the site: the API names a text key, and often a
 * detail that says exactly what went wrong. Anything else (no network, a bug) gets the general
 * message, followed by what exactly failed, so that it can be told and looked into.
 */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    for (const detail of error.details) {
      const key = `errors.details.${detail.code}`;
      if (t.has?.(key)) return t(key);
    }
    if (error.messageKey !== 'errors.internal' && t.has?.(error.messageKey)) {
      return t(error.messageKey);
    }
  }
  const reason = errorReason(error);
  return reason
    ? `${t('errors.internal')}\n${t('errors.reason', { reason })}`
    : t('errors.internal');
}

/**
 * What failed, as the phone or the server named it: the error's own text on the phone (say,
 * "Network request failed"), or the server's code, status and reference, by which its log is
 * searched.
 */
export function errorReason(error: unknown): string | null {
  if (error instanceof ApiError) {
    return error.correlationId ? `${error.message}, ${error.correlationId}` : error.message;
  }
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const reason = text.trim().replace(/\s+/g, ' ');
  if (!reason) return null;
  return reason.length > 200 ? `${reason.slice(0, 200)}…` : reason;
}
