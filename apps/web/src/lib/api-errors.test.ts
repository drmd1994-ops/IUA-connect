import { ApiError } from '@medconnect/api-client';
import { describe, expect, it } from 'vitest';
import { errorMessage, isApiError, passwordProblems } from './api-errors';

const t = (key: string) => `t(${key})`;
const apiError = (
  code: string,
  message: string,
  details: { field?: string; code: string }[] = [],
) => new ApiError(400, { error: { code, message, correlationId: 'corr-1', details } });

describe('api error helpers', () => {
  it('translates the i18n key carried by the API error', () => {
    expect(errorMessage(apiError('INVALID_CREDENTIALS', 'errors.auth.invalidCredentials'), t)).toBe(
      't(errors.auth.invalidCredentials)',
    );
  });

  it('prefers a translated detail code over the generic message', () => {
    const known = new Set(['errors.details.identifierInUse']);
    const withHas = Object.assign((key: string) => `t(${key})`, {
      has: (key: string) => known.has(key),
    });
    const error = apiError('CONFLICT', 'errors.conflict', [
      { field: 'x', code: 'somethingUnknown' },
      { field: 'identifier', code: 'identifierInUse' },
    ]);
    expect(errorMessage(error, withHas)).toBe('t(errors.details.identifierInUse)');
    expect(errorMessage(apiError('CONFLICT', 'errors.conflict', [{ code: 'x' }]), withHas)).toBe(
      't(errors.conflict)',
    );
  });

  it('falls back to the generic message for anything else', () => {
    expect(errorMessage(new TypeError('Failed to fetch'), t)).toBe('t(errors.internal)');
  });

  it('extracts password-policy problems', () => {
    const error = apiError('VALIDATION_FAILED', 'errors.validationFailed', [
      { field: 'password', code: 'PASSWORD_TOO_COMMON' },
      { field: 'email', code: 'INVALID_FORMAT' },
    ]);
    expect(passwordProblems(error)).toEqual(['auth.passwordProblems.PASSWORD_TOO_COMMON']);
    expect(passwordProblems(new Error('x'))).toEqual([]);
  });

  it('recognises error codes', () => {
    expect(
      isApiError(apiError('REAUTHENTICATION_REQUIRED', 'x'), 'REAUTHENTICATION_REQUIRED'),
    ).toBe(true);
    expect(isApiError(new Error('x'), 'REAUTHENTICATION_REQUIRED')).toBe(false);
  });
});
