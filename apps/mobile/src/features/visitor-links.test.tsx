import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { Refuse, callsTo, world } from '@/testing/world';
import { ResetPassword, VerifyEmail } from './visitor';

/** The screens an email's link opens in the app (M18b). */
describe('links from an email', () => {
  it('confirms the address with the link’s token, then leads to the sign-in', async () => {
    world.routes = { 'POST /api/v1/auth/verify-email': { status: 'ok' } };
    const done = jest.fn();
    const drawn = await draw(<VerifyEmail token="tok-1" onDone={done} />);
    await settle();
    expect(callsTo('POST', '/api/v1/auth/verify-email')[0]?.body).toEqual({ token: 'tok-1' });
    expect(allText(drawn)).toContain('Your address is verified');
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(done).toHaveBeenCalled();
  });

  it('offers a new link when the token was used or has expired', async () => {
    world.routes = {
      'POST /api/v1/auth/verify-email': () => {
        throw new Refuse(400, 'TOKEN_INVALID');
      },
      'POST /api/v1/auth/verify-email/resend': { status: 'accepted' },
    };
    const drawn = await draw(<VerifyEmail token="old" onDone={jest.fn()} />);
    await settle();
    expect(allText(drawn)).toContain('We couldn’t verify this address');
    await fireEvent.changeText(screen.getByLabelText('Email'), ' noa@demo.test ');
    await fireEvent.press(screen.getByLabelText('Send a new link'));
    await settle();
    expect(callsTo('POST', '/api/v1/auth/verify-email/resend')[0]?.body).toEqual({
      email: 'noa@demo.test',
    });
  });

  it('sets a new password with the link’s token, and says the sessions ended', async () => {
    world.routes = { 'POST /api/v1/auth/password/reset': { status: 'ok' } };
    const drawn = await draw(<ResetPassword token="tok-2" onDone={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'a new and longer phrase');
    await fireEvent.press(screen.getByLabelText('Save password'));
    await settle();
    expect(callsTo('POST', '/api/v1/auth/password/reset')[0]?.body).toEqual({
      token: 'tok-2',
      newPassword: 'a new and longer phrase',
    });
    expect(allText(drawn)).toContain('All previous sessions were signed out.');
  });

  it('says what is wrong with a password the server refuses', async () => {
    world.routes = {
      'POST /api/v1/auth/password/reset': () => {
        throw new Refuse(400, 'VALIDATION_FAILED', [{ code: 'PASSWORD_TOO_SHORT' }]);
      },
    };
    const drawn = await draw(<ResetPassword token="tok-3" onDone={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    await fireEvent.press(screen.getByLabelText('Save password'));
    await settle();
    expect(allText(drawn)).toContain('Too short: use at least 12 characters.');
  });
});
