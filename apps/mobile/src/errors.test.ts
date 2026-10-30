import { ApiError, toApiError } from '@medconnect/api-client';
import { describe, expect, it } from 'vitest';
import { errorMessage, errorReason } from './errors';

const texts: Record<string, string> = {
  'errors.internal': 'Something went wrong.',
  'errors.reason': 'Details: {reason}',
  'errors.forbidden': 'Not allowed.',
  'errors.details.FILE_TOO_LARGE': 'Too large.',
};
const t = Object.assign(
  (key: string, values?: Record<string, string>) =>
    (texts[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => values?.[name] ?? ''),
  { has: (key: string) => key in texts },
);

function apiError(status: number, code: string, message: string, details: { code: string }[] = []) {
  return new ApiError(status, {
    error: { code, message, correlationId: 'ref-1', details },
  } as ConstructorParameters<typeof ApiError>[1]);
}

describe('errorMessage', () => {
  it('says what the server named, without details', () => {
    expect(errorMessage(apiError(403, 'FORBIDDEN', 'errors.forbidden'), t)).toBe('Not allowed.');
    expect(
      errorMessage(
        apiError(400, 'VALIDATION', 'errors.forbidden', [{ code: 'FILE_TOO_LARGE' }]),
        t,
      ),
    ).toBe('Too large.');
  });

  it('adds what failed on the phone to the general message', () => {
    expect(errorMessage(new TypeError('Network request failed'), t)).toBe(
      'Something went wrong.\nDetails: Network request failed',
    );
  });

  it("adds the server's code, status and reference when it gave no known text", () => {
    expect(errorMessage(apiError(500, 'INTERNAL_ERROR', 'errors.internal'), t)).toBe(
      'Something went wrong.\nDetails: INTERNAL_ERROR (500), ref-1',
    );
    expect(errorMessage(toApiError(413, '<html>Too large</html>'), t)).toMatch(
      /^Something went wrong\.\nDetails: INTERNAL_ERROR \(413\)/,
    );
  });

  it('gives the general message alone when nothing names the cause', () => {
    expect(errorMessage(undefined, t)).toBe('Something went wrong.');
    expect(errorMessage(new Error('  '), t)).toBe('Something went wrong.');
  });
});

describe('errorReason', () => {
  it('keeps a long reason short and on one line', () => {
    const reason = errorReason(new Error(`a\n${'b'.repeat(300)}`));
    expect(reason).toHaveLength(201);
    expect(reason).not.toContain('\n');
  });
});
