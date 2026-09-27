import { REDACTED, redact } from './redact';

describe('redact', () => {
  it('replaces sensitive values at any depth', () => {
    const input = {
      email: 'dana.levi@example.test',
      password: 'hunter2hunter2',
      profile: { specialistCertificateNo: '12345', nested: [{ refreshToken: 'abc' }] },
      totpSecret: 'JBSWY3DP',
      Authorization: 'Bearer x',
    };
    expect(redact(input)).toEqual({
      email: 'dana.levi@example.test',
      password: REDACTED,
      profile: { specialistCertificateNo: REDACTED, nested: [{ refreshToken: REDACTED }] },
      totpSecret: REDACTED,
      Authorization: REDACTED,
    });
  });

  it('does not mutate the input', () => {
    const input = { password: 'x' };
    redact(input);
    expect(input.password).toBe('x');
  });

  it('keeps primitives, nulls and dates', () => {
    expect(redact('text')).toBe('text');
    expect(redact(null)).toBeNull();
    expect(redact({ at: new Date('2026-01-01T00:00:00Z') })).toEqual({
      at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('stops at a maximum depth', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain(REDACTED);
  });
});
