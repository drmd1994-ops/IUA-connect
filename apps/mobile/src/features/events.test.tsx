import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { event, everything, notRegistered, registered, sessions } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import { EventPage } from './events';

const BASE = '/api/v1/events/workshop';

/** A pretend server for one event that remembers whether the reader is registered. */
function eventServer(start = notRegistered, placesLeft: number | null = 4) {
  let mine = start;
  const routes: Record<string, Answer> = {
    ...everything,
    [`GET ${BASE}`]: () => ({ ...event, placesLeft }),
    [`GET ${BASE}/sessions`]: sessions,
    [`GET ${BASE}/registration`]: () => mine,
    [`POST ${BASE}/registration`]: () => (mine = registered),
    [`DELETE ${BASE}/registration`]: () => (mine = notRegistered),
    [`PUT ${BASE}/schedule`]: ({ body }) =>
      (mine = { ...registered, sessionIds: (body as { sessionIds: string[] }).sessionIds }),
  };
  return routes;
}

describe('registering for an event', () => {
  it('registers, and says so', async () => {
    world.routes = eventServer();
    const drawn = await draw(<EventPage slug="workshop" />);
    expect(allText(drawn)).toContain('4 places left');

    await fireEvent.press(screen.getByLabelText('Register'));
    await settle();
    expect(callsTo('POST', `${BASE}/registration`)).toHaveLength(1);
    expect(allText(drawn)).toContain('You are registered.');
    expect(screen.queryByLabelText('Register')).toBeNull();
    expect(screen.getByLabelText('Cancel my registration')).toBeTruthy();
  });

  it('lets a registered member choose sessions and save them', async () => {
    world.routes = eventServer(registered);
    const drawn = await draw(<EventPage slug="workshop" />);
    await fireEvent.press(screen.getByLabelText('Add “Opening session” to my schedule'));
    await fireEvent.press(screen.getByLabelText('Save my schedule'));
    await settle();
    expect(callsTo('PUT', `${BASE}/schedule`)[0]?.body).toEqual({ sessionIds: ['ses-1'] });
    expect(allText(drawn)).toContain('Your schedule was saved.');
  });

  it('offers no sessions to choose before registering', async () => {
    world.routes = eventServer();
    await draw(<EventPage slug="workshop" />);
    expect(screen.queryByLabelText('Save my schedule')).toBeNull();
  });

  it('cancels a registration', async () => {
    world.routes = eventServer(registered);
    await draw(<EventPage slug="workshop" />);
    await fireEvent.press(screen.getByLabelText('Cancel my registration'));
    await settle();
    expect(callsTo('DELETE', `${BASE}/registration`)).toHaveLength(1);
    expect(screen.getByLabelText('Register')).toBeTruthy();
  });

  it('offers the waiting list when the event is full', async () => {
    world.routes = eventServer(notRegistered, 0);
    await draw(<EventPage slug="workshop" />);
    expect(screen.queryByLabelText('Register')).toBeNull();
    expect(screen.getByLabelText('Join the waiting list')).toBeTruthy();
  });

  it('shows the server’s refusal in words, and stays unregistered', async () => {
    world.routes = {
      ...eventServer(),
      [`POST ${BASE}/registration`]: () => {
        throw new Refuse(409, 'CONFLICT');
      },
    };
    const drawn = await draw(<EventPage slug="workshop" />);
    await fireEvent.press(screen.getByLabelText('Register'));
    await settle();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(allText(drawn)).not.toContain('You are registered.');
    expect(allText(drawn)).not.toMatch(/MISSING:|errors\./);
  });

  it('asks a visitor to sign in, and asks the server nothing about them', async () => {
    world.routes = eventServer();
    world.guest = true;
    const drawn = await draw(<EventPage slug="workshop" />);
    expect(allText(drawn)).toContain('Sign in to register.');
    expect(screen.queryByLabelText('Register')).toBeNull();
    expect(callsTo('GET', `${BASE}/registration`)).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(world.pushed).toEqual(['(sign in)']);
  });
});
