import { screen } from '@testing-library/react-native';
import { secureStore } from '@/session/secure-store';
import { allText, draw } from '@/testing/draw';
import { membership, profile } from '@/testing/fixtures';
import { world } from '@/testing/world';
import { MembershipCard } from './card';
import { CARD_KEY } from './card-model';

const online = {
  'GET /api/v1/me/membership': membership,
  'GET /api/v1/me/profile': profile,
  'GET /api/v1/me/membership/card-token': { token: 'tok-1' },
};

describe('the membership card', () => {
  beforeEach(async () => {
    await secureStore.remove(CARD_KEY);
  });

  it('shows the member, the kind of membership, and a code a scanner can read', async () => {
    world.routes = online;
    const drawn = await draw(<MembershipCard />);
    const text = allText(drawn);
    expect(text).toContain('Noa Bar-Lev');
    expect(text).toContain('Full member');
    // The code is a picture; a screen reader is told whose card it is.
    expect(screen.getByRole('image')).toBeTruthy();
  });

  it('keeps the card on the phone, and never its code', async () => {
    world.routes = online;
    await draw(<MembershipCard />);
    const kept = await secureStore.get(CARD_KEY);
    expect(kept).toContain('Noa Bar-Lev');
    expect(kept).not.toContain('tok-1');
  });

  it('shows no code for a membership that is not active', async () => {
    world.routes = {
      ...online,
      'GET /api/v1/me/membership': {
        ...membership,
        membership: { ...membership.membership!, status: 'EXPIRED' },
      },
    };
    await draw(<MembershipCard />);
    expect(screen.queryByRole('image')).toBeNull();
    expect(world.calls.some((call) => call.path.endsWith('/card-token'))).toBe(false);
  });

  it('without a connection shows the card as it last was, with its date and without a code', async () => {
    await secureStore.set(
      CARD_KEY,
      JSON.stringify({
        person: 'Noa Bar-Lev',
        typeHe: 'חבר/ה מן המניין',
        typeEn: 'Full member',
        status: 'ACTIVE',
        endDate: '2026-12-31',
        fetchedAt: '2026-10-01T08:00:00.000Z',
      }),
    );
    // No answer at all, as when the phone has no connection.
    const offline = () => {
      throw new TypeError('Network request failed');
    };
    world.routes = { 'GET /api/v1/me/membership': offline, 'GET /api/v1/me/profile': offline };
    const drawn = await draw(<MembershipCard />);
    const text = allText(drawn);
    expect(text).toContain('Noa Bar-Lev');
    expect(text).toContain('No connection');
    expect(text).toContain('October 1, 2026');
    expect(screen.queryByRole('image')).toBeNull();
  });
});
