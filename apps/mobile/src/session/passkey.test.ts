import { describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'android' }));
const isSupported = vi.hoisted(() => vi.fn(() => true));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('react-native-passkey', () => ({ Passkey: { isSupported } }));
const { PasskeyProblem, classifyPasskeyError, passkeysSupported } = await import('./passkey');

describe('whether the app offers passkeys (M18b, M37)', () => {
  it('asks the phone on Android', () => {
    platform.OS = 'android';
    isSupported.mockReturnValueOnce(true);
    expect(passkeysSupported()).toBe(true);
    isSupported.mockReturnValueOnce(false);
    expect(passkeysSupported()).toBe(false);
  });

  it('never offers them on an iPhone, without asking the phone', () => {
    platform.OS = 'ios';
    isSupported.mockClear();
    expect(passkeysSupported()).toBe(false);
    expect(isSupported).not.toHaveBeenCalled();
    platform.OS = 'android';
  });
});

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
