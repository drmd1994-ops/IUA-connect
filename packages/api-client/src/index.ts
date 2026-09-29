import createClient, { type Client } from 'openapi-fetch';
import { CORRELATION_ID_HEADER, type ErrorEnvelope, errorEnvelopeSchema } from '@iua/shared';
import { type paths } from './schema';

export type { components, paths } from './schema';

export interface ApiClientOptions {
  /** Origin of the API, e.g. http://localhost:4000 */
  baseUrl: string;
  /** Returns the in-memory access token, if any (ARCHITECTURE.md §9). */
  getAccessToken?: () => string | undefined;
  /** Locale sent as Accept-Language, so error keys and content come back localized. */
  locale?: string;
  fetch?: typeof globalThis.fetch;
}

export type ApiClient = Client<paths>;

/** Typed client for the IUA Connect API. Paths and payloads come from the generated schema. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: 'include',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  client.use({
    onRequest({ request }) {
      const token = options.getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      if (options.locale) request.headers.set('Accept-Language', options.locale);
      return request;
    },
  });
  return client;
}

/** An API error in the standard envelope. `messageKey` is an i18n key for the UI to translate. */
export class ApiError extends Error {
  readonly code: string;
  readonly messageKey: string;
  readonly correlationId: string;
  readonly details: NonNullable<ErrorEnvelope['error']['details']>;

  constructor(
    readonly status: number,
    envelope: ErrorEnvelope,
  ) {
    super(`${envelope.error.code} (${status})`);
    this.name = 'ApiError';
    this.code = envelope.error.code;
    this.messageKey = envelope.error.message;
    this.correlationId = envelope.error.correlationId;
    this.details = envelope.error.details ?? [];
  }
}

/** Converts an error body into ApiError; bodies that are not envelopes become INTERNAL_ERROR. */
export function toApiError(status: number, body: unknown, headers?: Headers): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (parsed.success) return new ApiError(status, parsed.data);
  return new ApiError(status, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'errors.internal',
      correlationId: headers?.get(CORRELATION_ID_HEADER) ?? 'unknown',
    },
  });
}
