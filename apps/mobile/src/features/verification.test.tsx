import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, expectSound } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { callsTo, world } from '@/testing/world';
import { VerificationScreen } from './verification';

const notAsked = {
  status: 'NOT_ASKED',
  verifiedAs: null,
  verifiedUntil: null,
  byOrganisation: false,
  canAsk: true,
  latest: null,
};

describe('verification in the app', () => {
  it.each(['en', 'he'] as const)('is sound in %s', async (locale) => {
    world.routes = everything;
    expectSound(await draw(<VerificationScreen />, locale));
  });

  it('shows a verified physician until when, and offers nothing to send', async () => {
    world.routes = everything;
    const text = allText(await draw(<VerificationScreen />));
    expect(text).toContain('You are verified as Physician.');
    expect(text).not.toContain('Send the request');
  });

  it('asks as a physician with the licence number', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/me/verification': notAsked,
      'POST /api/v1/me/verification': { id: 'v-2' },
    };
    await draw(<VerificationScreen />);
    await fireEvent.press(screen.getByLabelText('Resident'));
    await fireEvent.changeText(screen.getByLabelText('Medical licence number'), ' 12345 ');
    await fireEvent.press(screen.getByLabelText('Send the request'));
    expect(callsTo('POST', '/api/v1/me/verification')[0]?.body).toEqual({
      kind: 'RESIDENT',
      licence: '12345',
    });
  });

  it('a student names the school and the date; no licence is asked', async () => {
    world.routes = { ...everything, 'GET /api/v1/me/verification': notAsked };
    await draw(<VerificationScreen />);
    await fireEvent.press(screen.getByLabelText('Medical student'));
    expect(screen.queryByLabelText('Medical licence number')).toBeNull();
    expect(screen.getByLabelText('Tel Aviv University')).toBeTruthy();
    expect(screen.getByLabelText('Confirmation from your school')).toBeTruthy();
  });

  it('sends someone without a name to the profile first', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/me/verification': notAsked,
      'GET /api/v1/me/profile': {
        ...(everything['GET /api/v1/me/profile'] as object),
        firstName: null,
      },
    };
    const text = allText(await draw(<VerificationScreen />));
    expect(text).toContain('Please fill in your first and last name in your profile first.');
  });
});
