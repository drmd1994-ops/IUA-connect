import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, expectSound } from '@/testing/draw';
import { world } from '@/testing/world';
import { Home } from './home';

const member = {
  'GET /api/v1/me': { id: 'u1', email: 'member.full@demo.test', roles: [] },
  'GET /api/v1/me/membership': {
    membership: {
      id: 'm1',
      type: { id: 't1', key: 'full', nameHe: 'חבר מן המניין', nameEn: 'Full member' },
      status: 'ACTIVE',
      startDate: '2025-01-01',
      endDate: '2026-12-31',
      paymentStatus: 'PAID',
    },
    history: [],
  },
  'GET /api/v1/notifications/unread-count': { unread: 3 },
};

describe('Home', () => {
  it.each(['en', 'he'] as const)('is sound in %s', async (locale) => {
    world.routes = member;
    expectSound(await draw(<Home />, locale));
  });

  it('shows the membership, and the number of unread notifications', async () => {
    world.routes = member;
    const drawn = await draw(<Home />);
    expect(allText(drawn)).toContain('Active until December 31, 2026');
    // The number comes from the field the server really sends ("unread").
    expect(allText(drawn)).toContain('3 unread notifications');
  });

  it('leads to the card and to the notifications', async () => {
    world.routes = member;
    await draw(<Home />);
    await fireEvent.press(screen.getByLabelText('Open my membership card'));
    await fireEvent.press(screen.getByLabelText('Open notifications'));
    expect(world.pushed).toEqual(['/card', '/notifications']);
  });

  it('offers someone without a membership the way to apply', async () => {
    world.routes = { ...member, 'GET /api/v1/me/membership': { membership: null, history: [] } };
    await draw(<Home />);
    await fireEvent.press(screen.getByLabelText('Apply for membership'));
    expect(world.pushed).toEqual(['/organisation']);
  });

  it('shows a visitor what is open, and the way to sign in', async () => {
    world.guest = true;
    const drawn = await draw(<Home />);
    expectSound(drawn);
    expect(world.calls).toEqual([]);
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(world.pushed).toEqual(['(sign in)']);
  });
});
