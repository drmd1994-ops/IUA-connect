import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import {
  MentorSettingsScreen,
  MentorsScreen,
  MentorshipRequestsScreen,
  PositionScreen,
  PositionsScreen,
} from './careers';

/** M28: jobs, fellowships and mentorship in the app. The people and positions are fictional. */
describe('positions in the app', () => {
  it('lists the open positions, abroad too, with the ways on for a member', async () => {
    world.routes = everything;
    const text = allText(await draw(<PositionsScreen />));
    expect(text).toContain('A sample fellowship');
    expect(text).toContain('Urology, Sample Hospital, A city');
    expect(text).toContain('A made-up institute, Lyon, France');
    expect(text).toContain('Apply by December 1, 2026');
    expect(text).toContain('Saved positions');
  });

  it('shows a visitor the positions, without saving or mentorship', async () => {
    world.routes = everything;
    world.guest = true;
    const text = allText(await draw(<PositionsScreen />, 'he'));
    expect(text).toContain('השתלמות לדוגמה');
    expect(text).not.toContain('משרות ששמרתי');
  });

  it('searches by kind', async () => {
    world.routes = everything;
    await draw(<PositionsScreen />);
    await fireEvent.press(screen.getByLabelText('Research post'));
    await settle();
    expect(world.calls.filter((c) => c.path === '/api/v1/positions').at(-1)?.query).toContain(
      'kind=RESEARCH',
    );
  });

  it('shows how to apply, that it is a sample, and saves it', async () => {
    world.routes = everything;
    const drawn = await draw(<PositionScreen id="p-1" />);
    const text = allText(drawn);
    expect(text).toContain('Sample position, not a real offer.');
    expect(text).toContain('Write to careers@example.test');
    expect(text).toContain('Apply on the institution’s site');
    // The sample is saved already: removed, then saved again.
    await fireEvent.press(screen.getByLabelText('Remove from saved'));
    await settle();
    expect(callsTo('DELETE', '/api/v1/positions/p-1/saved')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(callsTo('PUT', '/api/v1/positions/p-1/saved')).toHaveLength(1);
  });
});

describe('mentorship in the app', () => {
  it('asks a mentor, with a message', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/mentorship/requests': () => ({}),
    } as Record<string, Answer>;
    const drawn = await draw(<MentorsScreen />);
    expect(allText(drawn)).toContain('Hila Shapira');
    expect(allText(drawn)).toContain('One call a month');
    await fireEvent.press(screen.getByLabelText('Ask for mentorship'));
    await fireEvent.changeText(
      screen.getByLabelText('Your message to Hila Shapira'),
      'I am a resident and would like advice.',
    );
    await fireEvent.press(screen.getByLabelText('Send the request'));
    await settle();
    expect(callsTo('POST', '/api/v1/mentorship/requests')[0]?.body).toEqual({
      mentorId: 'u-mentor',
      message: 'I am a resident and would like advice.',
    });
    expect(allText(drawn)).toContain('Your request was sent.');
  });

  it('tells a person who is not verified that mentors are for verified people', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/mentorship/mentors': () => {
        throw new Refuse(403, 'FORBIDDEN', [{ code: 'membersOnly' }]);
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<MentorsScreen />));
    expect(text).toContain('Mentors are open to people whose account has been verified');
  });

  it('lets the mentor accept, and the mentee open the conversation', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/mentorship/requests/ms-1/accept': () => ({
        ...(everything['GET /api/v1/mentorship/requests'] as { items: object[] }).items[0],
        state: 'ACCEPTED',
        conversationId: 'c-9',
      }),
    } as Record<string, Answer>;
    const drawn = await draw(<MentorshipRequestsScreen />);
    expect(allText(drawn)).toContain('Yoav Sela');
    expect(allText(drawn)).toContain('If you decline, they aren’t told why.');
    await fireEvent.press(screen.getByLabelText('Accept'));
    await settle();
    expect(callsTo('POST', '/api/v1/mentorship/requests/ms-1/accept')).toHaveLength(1);
    const chats = screen.getAllByLabelText('Open the conversation');
    await fireEvent.press(chats[0]!);
    expect(world.pushed).toContain('/thread/direct/c-9');
  });

  it('saves a mentor’s settings', async () => {
    world.routes = {
      ...everything,
      'PUT /api/v1/mentorship/settings': ({ body }) => ({
        eligible: true,
        settings: body,
        active: 1,
      }),
    } as Record<string, Answer>;
    const drawn = await draw(<MentorSettingsScreen />, 'he');
    expect(allText(drawn)).toContain('יש לך חניך/ה אחד/ת כרגע.');
    await fireEvent.press(screen.getByLabelText('3'));
    await fireEvent.press(screen.getByLabelText('שמירה'));
    await settle();
    expect(callsTo('PUT', '/api/v1/mentorship/settings')[0]?.body).toMatchObject({
      open: true,
      capacity: 3,
      languages: ['he', 'en'],
    });
    expect(allText(drawn)).toContain('הגדרות החונכות נשמרו.');
  });
});
