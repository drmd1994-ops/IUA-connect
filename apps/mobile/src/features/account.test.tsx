import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { Refuse, callsTo, world } from '@/testing/world';
import { SecurityScreen } from './account';

async function changePassword(current: string, next: string) {
  await fireEvent.changeText(screen.getByLabelText('Current password'), current);
  await fireEvent.changeText(screen.getByLabelText('New password'), next);
  await fireEvent.press(screen.getByLabelText('Change password'));
  await settle();
}

describe('account security', () => {
  it('changes the password, says so, and empties the boxes', async () => {
    world.routes = { ...everything, 'POST /api/v1/auth/password/change': {} };
    const drawn = await draw(<SecurityScreen />);
    await changePassword('the old phrase', 'a new and longer phrase');
    expect(callsTo('POST', '/api/v1/auth/password/change')[0]?.body).toEqual({
      currentPassword: 'the old phrase',
      newPassword: 'a new and longer phrase',
    });
    expect(allText(drawn)).toContain('Password changed.');
    expect(screen.getByLabelText('Current password').props.value).toBe('');
    expect(screen.getByLabelText('New password').props.value).toBe('');
  });

  it('says what is wrong with a password the server refuses', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/auth/password/change': () => {
        throw new Refuse(400, 'VALIDATION_FAILED', [{ code: 'PASSWORD_TOO_SHORT' }]);
      },
    };
    const drawn = await draw(<SecurityScreen />);
    await changePassword('the old phrase', 'short');
    expect(allText(drawn)).toContain('Too short: use at least 12 characters.');
    expect(allText(drawn)).not.toContain('Password changed.');
  });

  it('asks "confirm it’s you" when the server wants it, then finishes the change', async () => {
    let confirmed = false;
    world.routes = {
      ...everything,
      'POST /api/v1/auth/reauthenticate': () => {
        confirmed = true;
        return {};
      },
      'POST /api/v1/auth/mfa/totp/setup': () => {
        if (!confirmed) throw new Refuse(403, 'REAUTHENTICATION_REQUIRED');
        return {
          factorId: 'f-1',
          secret: 'ABCDEFGHIJKLMNOP',
          otpauthUri: 'otpauth://totp/x',
          qrCode: '',
        };
      },
    };
    const drawn = await draw(<SecurityScreen />);
    await fireEvent.press(screen.getByLabelText('Turn on two-step verification'));
    await settle();
    expect(allText(drawn)).toContain('Confirm it’s you');
    // Nothing of the set-up is shown before the person proved who they are.
    expect(allText(drawn)).not.toContain('ABCD');

    await fireEvent.changeText(screen.getByLabelText('Password'), 'the old phrase');
    await fireEvent.press(screen.getByLabelText('Confirm'));
    await settle();
    expect(callsTo('POST', '/api/v1/auth/reauthenticate')[0]?.body).toEqual({
      password: 'the old phrase',
    });
    expect(callsTo('POST', '/api/v1/auth/mfa/totp/setup')).toHaveLength(2);
    expect(allText(drawn)).toContain('ABCD EFGH IJKL MNOP');
    expect(allText(drawn)).not.toContain('Confirm it’s you');
  });

  it('shows recovery codes once the authenticator is confirmed', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/auth/mfa/totp/setup': {
        factorId: 'f-1',
        secret: 'ABCDEFGH',
        otpauthUri: 'otpauth://totp/x',
        qrCode: '',
      },
      'POST /api/v1/auth/mfa/totp/confirm': { recoveryCodes: ['aaaa-1111', 'bbbb-2222'] },
    };
    const drawn = await draw(<SecurityScreen />);
    await fireEvent.press(screen.getByLabelText('Turn on two-step verification'));
    await settle();
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    await fireEvent.press(screen.getByLabelText('Confirm and turn on'));
    await settle();
    expect(callsTo('POST', '/api/v1/auth/mfa/totp/confirm')[0]?.body).toEqual({
      factorId: 'f-1',
      code: '123456',
    });
    expect(allText(drawn)).toContain('aaaa-1111');
    expect(allText(drawn)).toContain('bbbb-2222');
  });

  it('signs another session out, and never offers that for this phone', async () => {
    world.routes = { ...everything, 'DELETE /api/v1/auth/sessions/s-2': {} };
    await draw(<SecurityScreen />);
    expect(screen.queryByLabelText('Sign out: This phone')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Sign out: Chrome on Windows'));
    await settle();
    expect(callsTo('DELETE', '/api/v1/auth/sessions/s-2')).toHaveLength(1);
  });

  it('signs all other sessions out and says how many', async () => {
    world.routes = { ...everything, 'DELETE /api/v1/auth/sessions': { revoked: 1 } };
    const drawn = await draw(<SecurityScreen />);
    await fireEvent.press(screen.getByLabelText('Sign out all other sessions'));
    await settle();
    expect(allText(drawn)).toContain('1 sessions signed out.');
  });
});
