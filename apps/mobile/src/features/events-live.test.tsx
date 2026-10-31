import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, callsTo, world } from '@/testing/world';
import { LiveSessionScreen, NowAndNext } from './events-live';

const BASE = '/api/v1/events/conf/sessions/ses-1';

const closedPoll = {
  id: 'poll-1',
  question: 'Where did you come from?',
  status: 'OPEN',
  options: [
    { id: 'north', text: 'North', votes: null },
    { id: 'south', text: 'South', votes: null },
  ],
  total: null,
  voted: false,
};

const live = {
  sessionId: 'ses-1',
  moderateQuestions: true,
  allowAnonymousQuestions: false,
  questionsOpen: true,
  feedbackOpen: true,
  feedbackGiven: false,
  canChair: false,
  canModerate: false,
  polls: [closedPoll],
  questions: [],
};

function server(state: Record<string, unknown> = live) {
  let current = state;
  const routes: Record<string, Answer> = {
    ...everything,
    [`GET ${BASE}/live`]: () => current,
    'GET /api/v1/events/conf/sessions': { items: [{ id: 'ses-1', title: 'Opening' }] },
    [`POST ${BASE}/polls/poll-1/vote`]: () => {
      current = {
        ...current,
        polls: [
          {
            ...closedPoll,
            voted: true,
            total: 1,
            options: [
              { id: 'north', text: 'North', votes: 1 },
              { id: 'south', text: 'South', votes: 0 },
            ],
          },
        ],
      };
      return {};
    },
    [`POST ${BASE}/questions`]: {},
    [`POST ${BASE}/feedback`]: () => {
      current = { ...current, feedbackGiven: true };
      return {};
    },
  };
  return routes;
}

describe('a live session', () => {
  it('hides results until the vote, and shows them after it', async () => {
    world.routes = server();
    const drawn = await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(allText(drawn)).toContain('Where did you come from?');
    expect(allText(drawn)).not.toContain('%');

    await fireEvent.press(screen.getByLabelText('North'));
    await fireEvent.press(screen.getByLabelText('Vote'));
    await settle();
    expect(callsTo('POST', `${BASE}/polls/poll-1/vote`)[0]?.body).toEqual({ optionId: 'north' });
    expect(allText(drawn)).toContain('North: 100%');
    expect(allText(drawn)).toContain('Your vote was counted.');
    expect(screen.queryByLabelText('Vote')).toBeNull();
  });

  it('says a question goes to a moderator first, and warns about patient details', async () => {
    world.routes = server();
    const drawn = await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(allText(drawn)).toContain('could identify a patient');
    await fireEvent.changeText(screen.getByLabelText('Your question'), 'What about follow-up?');
    await fireEvent.press(screen.getByLabelText('Send the question'));
    await settle();
    expect(callsTo('POST', `${BASE}/questions`)[0]?.body).toEqual({
      text: 'What about follow-up?',
      anonymous: false,
    });
    expect(allText(drawn)).toContain('A moderator reads it');
  });

  it('offers no anonymous question unless the chair allows it', async () => {
    world.routes = server();
    await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(screen.queryByLabelText('Ask without my name')).toBeNull();

    world.routes = server({ ...live, allowAnonymousQuestions: true });
    await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(screen.getByLabelText('Ask without my name')).toBeTruthy();
  });

  it('takes feedback once', async () => {
    world.routes = server();
    const drawn = await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    await fireEvent.press(screen.getByLabelText('4'));
    await fireEvent.press(screen.getByLabelText('Send feedback'));
    await settle();
    expect(callsTo('POST', `${BASE}/feedback`)[0]?.body).toEqual({ rating: 4 });
    expect(allText(drawn)).toContain('Thank you for your feedback.');
    expect(screen.queryByLabelText('Send feedback')).toBeNull();
  });

  it("shows the chair's controls only to a chair", async () => {
    world.routes = server();
    await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(screen.queryByLabelText('Save as a draft')).toBeNull();

    world.routes = {
      ...server({ ...live, canChair: true, canModerate: true }),
      [`POST ${BASE}/chair/polls`]: {},
    };
    await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    await fireEvent.changeText(screen.getByLabelText('The question'), 'A new one?');
    await fireEvent.changeText(screen.getByLabelText('Answer 1'), 'Yes');
    await fireEvent.changeText(screen.getByLabelText('Answer 2'), 'No');
    await fireEvent.press(screen.getByLabelText('Save as a draft'));
    await settle();
    expect(callsTo('POST', `${BASE}/chair/polls`)[0]?.body).toEqual({
      question: 'A new one?',
      options: ['Yes', 'No'],
    });
  });

  it('lets a moderator let a waiting question through', async () => {
    world.routes = {
      ...server({
        ...live,
        canModerate: true,
        questions: [
          {
            id: 'q-1',
            text: 'Waiting',
            status: 'PENDING',
            upvotes: 0,
            authorName: null,
            guestNumber: 7,
            upvoted: false,
          },
        ] as never[],
      }),
      [`PUT ${BASE}/chair/questions/q-1/status`]: {},
    };
    const drawn = await draw(<LiveSessionScreen slug="conf" sessionId="ses-1" />);
    expect(allText(drawn)).toContain('Guest 7');
    await fireEvent.press(screen.getByLabelText('Let through'));
    await settle();
    expect(callsTo('PUT', `${BASE}/chair/questions/q-1/status`)[0]?.body).toEqual({
      status: 'VISIBLE',
    });
  });
});

describe('now and next', () => {
  const hour = 60 * 60 * 1000;
  const iso = (from: number) => new Date(Date.now() + from * hour).toISOString();
  const sessions = [
    { id: 'on', title: 'On now', startAt: iso(-0.5), endAt: iso(0.5), room: 'A' },
    { id: 'next', title: 'Coming next', startAt: iso(1), endAt: iso(2), room: null },
    { id: 'later', title: 'Much later', startAt: iso(3), endAt: iso(4), room: null },
  ];
  const event = { startAt: iso(-1), endAt: iso(5), timezone: 'Asia/Jerusalem' };

  it('shows what is on and what is next while the event runs, with my sessions', async () => {
    const drawn = await draw(
      <NowAndNext slug="conf" event={event} sessions={sessions} chosen={['later']} />,
    );
    const text = allText(drawn);
    expect(text).toContain('My schedule');
    expect(text).toContain('Much later');
    expect(text).toContain('On now');
    expect(text).toContain('Coming next');
  });

  it('shows nothing before the event', async () => {
    const drawn = await draw(
      <NowAndNext
        slug="conf"
        event={{ ...event, startAt: iso(1) }}
        sessions={sessions}
        chosen={[]}
      />,
    );
    expect(allText(drawn)).not.toContain('On now');
  });
});
