import { Secret, TOTP } from 'otpauth';
import {
  RECOVERY_CODE_COUNT,
  TOTP_SETTINGS,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from './mfa.service';

describe('TOTP compatibility (RFC 6238 test vectors, SHA-1)', () => {
  // RFC 6238 Appendix B: ASCII secret "12345678901234567890", 8 digits.
  const totp = new TOTP({
    algorithm: 'SHA1',
    digits: 8,
    period: 30,
    secret: Secret.fromUTF8('12345678901234567890'),
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('at %i s the code is %s', (seconds, expected) => {
    expect(totp.generate({ timestamp: seconds * 1000 })).toBe(expected);
  });

  it('uses the settings authenticator apps expect', () => {
    expect(TOTP_SETTINGS).toEqual({
      issuer: 'IUA Connect',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  });
});

describe('recovery codes', () => {
  it('have the form xxxxx-xxxxx from an unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRecoveryCode()).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
    }
  });

  it('are random', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateRecoveryCode));
    expect(codes.size).toBe(1000);
  });

  it('normalize case, spaces and dashes', () => {
    expect(normalizeRecoveryCode(' ABCDE - fghjk ')).toBe('abcdefghjk');
  });

  it('come ten at a time', () => {
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });
});
