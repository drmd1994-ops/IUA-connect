import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, toApiError } from './index';

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
