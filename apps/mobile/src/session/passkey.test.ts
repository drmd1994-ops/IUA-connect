import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-passkey', () => ({ Passkey: {} }));
const { PasskeyProblem, classifyPasskeyError } = await import('./passkey');

describe('the phone’s passkey errors (M18b)', () => {
  it('turns the library’s errors into the reasons the screens explain', () => {
    const reason = (error: string) => {
      const problem = classifyPasskeyError({ error, message: '' });
      expect(problem).toBeInstanceOf(PasskeyProblem);
      return (problem as { reason: string }).reason;
    };
    expect(reason('UserCancelled')).toBe('cancelled');
    expect(reason('TimedOut')).toBe('cancelled');
    expect(reason('CredentialAlreadyExists')).toBe('alreadyRegistered');
    expect(reason('NoCredentials')).toBe('none');
    expect(reason('NotSupported')).toBe('unsupported');
    expect(reason('BadConfiguration')).toBe('unsupported');
  });

  it('passes anything else on unchanged', () => {
    const other = { error: 'RequestFailed', message: 'x' };
    expect(classifyPasskeyError(other)).toBe(other);
  });
});
