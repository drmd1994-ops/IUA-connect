import { errorEnvelopeSchema } from '@iua/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, isErrorEnvelope, toApiError } from './index';

describe('toApiError', () => {
  it('reads the standard envelope', () => {
    const error = toApiError(403, {
      error: { code: 'FORBIDDEN', message: 'errors.forbidden', correlationId: 'abc12345' },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.messageKey).toBe('errors.forbidden');
    expect(error.correlationId).toBe('abc12345');
    expect(error.details).toEqual([]);
  });

  it('falls back to a generic error for unexpected bodies', () => {
    const headers = new Headers({ 'x-correlation-id': 'corr-0001' });
    const error = toApiError(502, '<html>Bad gateway</html>', headers);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.correlationId).toBe('corr-0001');
  });
});

describe('isErrorEnvelope', () => {
  const error = { code: 'FORBIDDEN', message: 'errors.forbidden', correlationId: 'abc12345' };
  const bodies: unknown[] = [
    { error },
    { error: { ...error, details: [] } },
    { error: { ...error, details: [{ code: 'required', field: 'email' }, { code: 'tooLong' }] } },
    { error: { ...error, extra: true } },
    null,
    'text',
    [],
    {},
    { error: null },
    { error: [] },
    { error: { ...error, code: 7 } },
    { error: { code: 'FORBIDDEN', message: 'errors.forbidden' } },
    { error: { ...error, details: 'none' } },
    { error: { ...error, details: [{ field: 'email' }] } },
    { error: { ...error, details: [{ code: 'required', field: 3 }] } },
    { error: { ...error, details: [null] } },
  ];

  // The check is written by hand to keep the schema library out of the browser; it must not
  // drift from the schema the API uses.
  it.each(bodies)('agrees with the shared schema for %j', (body) => {
    expect(isErrorEnvelope(body)).toBe(errorEnvelopeSchema.safeParse(body).success);
  });
});

describe('createApiClient', () => {
  it('sends the access token and locale', async () => {
    let seen: Request | undefined;
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => 'token-123',
      locale: 'he',
      fetch: async (input) => {
        seen = input as Request;
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    const { data } = await client.GET('/health/live');
    expect(data).toEqual({ status: 'ok' });
    expect(seen?.headers.get('authorization')).toBe('Bearer token-123');
    expect(seen?.headers.get('accept-language')).toBe('he');
  });
});
