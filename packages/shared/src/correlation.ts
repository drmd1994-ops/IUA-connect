export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Incoming correlation IDs are accepted only in this shape, so they are safe to log and echo. */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_ID_PATTERN.test(value);
}
