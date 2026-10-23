import { toApiError } from '@medconnect/api-client';
import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { world } from '@/testing/world';
import { PasskeyProblem, askForPasskey } from '@/session/passkey';
import { SignIn } from './sign-in';

const nothing = () => undefined;
const signIn = <SignIn onForgot={nothing} onRegister={nothing} onGuest={nothing} />;

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByLabelText('Sign in'));
  await settle();
}

describe('signing in', () => {
  it('sends the email, trimmed, and the password', async () => {
    world.session.signIn.mockResolvedValue(null);
    await draw(signIn);
    await fill('  member.full@demo.test ', 'a long phrase');
    expect(world.session.signIn).toHaveBeenCalledWith('member.full@demo.test', 'a long phrase');
  });

  it('asks for the authenticator code when the account has one, and sends it', async () => {
    world.session.signIn.mockResolvedValue({ mfaToken: 'challenge-1', methods: ['totp'] });
    world.session.verifyCode.mockResolvedValue(undefined);
    const drawn = await draw(signIn);
    await fill('member.full@demo.test', 'a long phrase');
    expect(allText(drawn)).toContain('Authenticator code');
    // The password is not kept on the screen once it was sent.
    expect(screen.queryByLabelText('Password')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Code'), ' 123456 ');
    await fireEvent.press(screen.getByLabelText('Continue'));
    await settle();
    expect(world.session.verifyCode).toHaveBeenCalledWith('challenge-1', '123456');
  });

  it('signs in with a passkey on the phone (M18b)', async () => {
    world.session.signInWithPasskey.mockResolvedValue(undefined);
    await draw(signIn);
    await fireEvent.press(screen.getByLabelText('Sign in with a passkey'));
    await settle();
    expect(world.session.signInWithPasskey).toHaveBeenCalledWith(askForPasskey);
  });

  it('explains a closed passkey prompt, and a phone without a passkey', async () => {
    world.session.signInWithPasskey.mockRejectedValueOnce(new PasskeyProblem('cancelled'));
    const drawn = await draw(signIn);
    await fireEvent.press(screen.getByLabelText('Sign in with a passkey'));
    await settle();
    expect(allText(drawn)).toContain('The passkey prompt was closed before it finished.');
    world.session.signInWithPasskey.mockRejectedValueOnce(new PasskeyProblem('none'));
    await fireEvent.press(screen.getByLabelText('Sign in with a passkey'));
    await settle();
    expect(allText(drawn)).toContain('This phone has no passkey for Med Connect.');
  });

  it('offers a passkey for the second step when the account has one', async () => {
    world.session.signIn.mockResolvedValue({ mfaToken: 'c', methods: ['totp', 'passkey'] });
    world.session.signInWithPasskey.mockResolvedValue(undefined);
    await draw(signIn);
    await fill('member.full@demo.test', 'a long phrase');
    await fireEvent.press(screen.getByLabelText('Use a passkey instead'));
    await settle();
    expect(world.session.signInWithPasskey).toHaveBeenCalled();
  });

  it('offers no passkey for the second step when the account has none', async () => {
    world.session.signIn.mockResolvedValue({ mfaToken: 'c', methods: ['totp'] });
    await draw(signIn);
    await fill('member.full@demo.test', 'a long phrase');
    expect(screen.queryByLabelText('Use a passkey instead')).toBeNull();
  });

  it('says so, in words, when the server refuses', async () => {
    world.session.signIn.mockRejectedValue(
      toApiError(
        401,
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'errors.auth.invalidCredentials',
            correlationId: 'test',
          },
        },
        new Headers(),
      ),
    );
    const drawn = await draw(signIn);
    await fill('member.full@demo.test', 'wrong');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(allText(drawn)).not.toMatch(/errors\.|MISSING:|INVALID_CREDENTIALS/);
  });

  it('leads to a forgotten password, a new account, and the open pages', async () => {
    const went: string[] = [];
    await draw(
      <SignIn
        onForgot={() => went.push('forgot')}
        onRegister={() => went.push('register')}
        onGuest={() => went.push('guest')}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Forgot your password?'));
    await fireEvent.press(screen.getByLabelText('Not registered yet? Open an account'));
    await fireEvent.press(screen.getByLabelText('Continue without signing in'));
    expect(went).toEqual(['forgot', 'register', 'guest']);
  });
});
