import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, expectSound } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { callsTo, world } from '@/testing/world';
import { OrganisationScreen } from './organisation';

const other = {
  id: 'o-2',
  slug: 'another-society',
  nameHe: 'אגודה אחרת',
  nameEn: 'Another society',
  descriptionHe: null,
  descriptionEn: null,
};

describe('an organisation’s section', () => {
  it.each(['en', 'he'] as const)('is sound in %s', async (locale) => {
    world.routes = everything;
    expectSound(await draw(<OrganisationScreen />, locale));
  });

  it('shows the member’s own organisation: the membership, its rooms, news and events', async () => {
    world.routes = everything;
    const drawn = await draw(<OrganisationScreen />);
    const text = allText(drawn);
    expect(text).toContain('A sample society');
    expect(text).toContain('Full member: Active');
    // The lists are asked for this organisation alone.
    for (const path of ['/api/v1/chat/rooms', '/api/v1/news', '/api/v1/events']) {
      expect(callsTo('GET', path)[0]?.query).toContain('organisation=o-1');
    }
  });

  it('leads to the card, the membership and the application', async () => {
    world.routes = everything;
    await draw(<OrganisationScreen />);
    await fireEvent.press(screen.getByLabelText('Membership card'));
    await fireEvent.press(screen.getByLabelText('Membership details'));
    await fireEvent.press(screen.getByLabelText('My application'));
    expect(world.pushed).toEqual(['/card', '/membership', '/applications']);
  });

  it('keeps the rooms from someone who is not a member, without asking for them', async () => {
    world.routes = { ...everything, 'GET /api/v1/me/memberships': { items: [] } };
    const drawn = await draw(<OrganisationScreen />);
    const text = allText(drawn);
    expect(text).toContain('You are not a member of this organisation.');
    expect(text).toContain('The rooms are open to the organisation’s members.');
    expect(callsTo('GET', '/api/v1/chat/rooms')).toEqual([]);
  });

  it('shows a visitor who the organisation is, and asks nothing about a membership', async () => {
    world.guest = true;
    world.routes = everything;
    const drawn = await draw(<OrganisationScreen />);
    expect(allText(drawn)).toContain('Sign in to see your membership here, or to apply.');
    expect(callsTo('GET', '/api/v1/me/memberships')).toEqual([]);
    expect(callsTo('GET', '/api/v1/chat/rooms')).toEqual([]);
  });

  it('lets someone in none of several organisations choose one', async () => {
    const one = (everything['GET /api/v1/organisations'] as { items: unknown[] }).items[0];
    world.routes = {
      ...everything,
      'GET /api/v1/me/memberships': { items: [] },
      'GET /api/v1/organisations': { items: [one, other] },
    };
    const drawn = await draw(<OrganisationScreen />);
    expect(callsTo('GET', '/api/v1/news')).toEqual([]);
    await fireEvent.press(screen.getByLabelText('Another society'));
    expect(allText(drawn)).toContain('The organisation has not written about itself yet.');
    expect(callsTo('GET', '/api/v1/news')[0]?.query).toContain('organisation=o-2');
  });
});
