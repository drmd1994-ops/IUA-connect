import { checkIdentifier, identifierHashInput } from './identifier';

describe('checkIdentifier', () => {
  it('accepts 1–15 digits, ignoring spaces and dashes', () => {
    expect(checkIdentifier('SPECIALIST_CERTIFICATE', '1')).toEqual({ ok: true, value: '1' });
    expect(checkIdentifier('MEDICAL_LICENCE', ' 12-345 678 ')).toEqual({
      ok: true,
      value: '12345678',
    });
    expect(checkIdentifier('MEDICAL_LICENCE', '1'.repeat(15))).toMatchObject({ ok: true });
  });

  it('requires a number when the type needs one', () => {
    expect(checkIdentifier('SPECIALIST_CERTIFICATE', undefined)).toEqual({
      ok: false,
      code: 'identifierRequired',
    });
    expect(checkIdentifier('MEDICAL_LICENCE', ' - ')).toEqual({
      ok: false,
      code: 'identifierRequired',
    });
  });

  it('rejects letters and more than 15 digits', () => {
    expect(checkIdentifier('MEDICAL_LICENCE', 'MD12345')).toEqual({
      ok: false,
      code: 'identifierInvalid',
    });
    expect(checkIdentifier('SPECIALIST_CERTIFICATE', '1'.repeat(16))).toEqual({
      ok: false,
      code: 'identifierInvalid',
    });
  });

  it('refuses a number for types that take none (students)', () => {
    expect(checkIdentifier('NONE', undefined)).toEqual({ ok: true, value: null });
    expect(checkIdentifier('NONE', '')).toEqual({ ok: true, value: null });
    expect(checkIdentifier('NONE', '123')).toEqual({ ok: false, code: 'identifierNotExpected' });
  });

  it('separates certificate and licence numbers for uniqueness', () => {
    expect(identifierHashInput('SPECIALIST_CERTIFICATE', '123')).not.toBe(
      identifierHashInput('MEDICAL_LICENCE', '123'),
    );
  });
});
