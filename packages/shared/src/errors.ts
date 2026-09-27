import { z } from 'zod';

/**
 * Stable machine-readable error codes (API_DESIGN.md §2).
 * Each code maps to an HTTP status and to an i18n message key the client translates.
 * Feature modules add their own codes here as they are built.
 */
export const ERROR_DEFINITIONS = {
  VALIDATION_FAILED: { status: 400, message: 'errors.validationFailed' },
  UNAUTHENTICATED: { status: 401, message: 'errors.unauthenticated' },
  FORBIDDEN: { status: 403, message: 'errors.forbidden' },
  NOT_FOUND: { status: 404, message: 'errors.notFound' },
  CONFLICT: { status: 409, message: 'errors.conflict' },
  PRECONDITION_FAILED: { status: 412, message: 'errors.preconditionFailed' },
  BUSINESS_RULE_VIOLATION: { status: 422, message: 'errors.businessRule' },
  RATE_LIMITED: { status: 429, message: 'errors.rateLimited' },
  INTERNAL_ERROR: { status: 500, message: 'errors.internal' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'errors.serviceUnavailable' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export const ERROR_CODES = Object.keys(ERROR_DEFINITIONS) as ErrorCode[];

/** Fallback code for an arbitrary HTTP status, used when a framework error has no explicit code. */
export function errorCodeForStatus(status: number): ErrorCode {
  const match = ERROR_CODES.find((code) => ERROR_DEFINITIONS[code].status === status);
  if (match) return match;
  return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED';
}

export const errorDetailSchema = z.object({
  field: z.string().optional(),
  code: z.string(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    correlationId: z.string(),
  }),
});

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
