import { COMMON_PASSWORD_COUNT, checkPassword } from './password-policy';

describe('password policy', () => {
  it('accepts a long, unremarkable passphrase', () => {
    expect(checkPassword('lithotripsy under the olive tree')).toEqual([]);
    expect(checkPassword('אורולוגיה-בירושלים-2026')).toEqual([]);
  });

  it('requires 12 to 128 characters, counting Hebrew letters and emoji once', () => {
    expect(checkPassword('short-pass1')).toEqual(['PASSWORD_TOO_SHORT']);
    expect(checkPassword('שלום-שלום-1')).toEqual(['PASSWORD_TOO_SHORT']);
    expect(checkPassword('🔒🔒🔒🔒🔒🔒abcdef')).not.toContain('PASSWORD_TOO_SHORT');
    expect(checkPassword('a'.repeat(129))).toEqual(['PASSWORD_TOO_LONG']);
  });

  it('rejects known breached passwords, ignoring case', () => {
    expect(COMMON_PASSWORD_COUNT).toBeGreaterThan(50_000);
    expect(checkPassword('000123456789')).toContain('PASSWORD_TOO_COMMON');
    expect(checkPassword('000WebHostPassword')).toContain('PASSWORD_TOO_COMMON');
  });

  it('rejects trivially repetitive strings', () => {
    expect(checkPassword('aaaaaaaaaaaaaaaa')).toContain('PASSWORD_TOO_SIMPLE');
    expect(checkPassword('abababababababab')).toContain('PASSWORD_TOO_SIMPLE');
  });

  it('rejects passwords containing the email name', () => {
    expect(checkPassword('dr.levinson-secure-2026', 'dr.levinson@example.test')).toContain(
      'PASSWORD_CONTAINS_EMAIL',
    );
    expect(checkPassword('entirely different words', 'dr.levinson@example.test')).toEqual([]);
  });
});
