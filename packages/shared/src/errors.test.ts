import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_DEFINITIONS, errorCodeForStatus } from './errors';

describe('error definitions', () => {
  it('uses i18n keys, never prose, as messages', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_DEFINITIONS[code].message).toMatch(/^errors\.[A-Za-z.]+$/);
    }
  });

  it('maps statuses to codes', () => {
    expect(errorCodeForStatus(401)).toBe('UNAUTHENTICATED');
    expect(errorCodeForStatus(404)).toBe('NOT_FOUND');
    expect(errorCodeForStatus(418)).toBe('VALIDATION_FAILED');
    expect(errorCodeForStatus(502)).toBe('INTERNAL_ERROR');
  });
});
