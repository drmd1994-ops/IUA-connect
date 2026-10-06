import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { conversation, everything, message, room } from '@/testing/fixtures';
import { type Answer, callsTo, world } from '@/testing/world';
import { ThreadScreen } from './thread';

const DIRECT = '/api/v1/chat/conversations/c-1';
const ROOM = '/api/v1/chat/rooms/r-1';

/** The panel of the n-th message (0 is the oldest shown). */
async function openMenu(index: number) {
  await fireEvent.press(screen.getAllByLabelText('Actions for this message')[index]!);
  await settle(2);
}
const offered = (label: string) => screen.queryByLabelText(label) !== null;

describe('a private conversation', () => {
  it('shows the messages, whose they are, and how far the reader’s own got', async () => {
    world.routes = everything;
    const drawn = await draw(<ThreadScreen kind="direct" id="c-1" />);
    const text = allText(drawn);
    expect(text).toContain('Good morning');
    expect(text).toContain('Good morning to you');
    // The reader's message, number 2, was read by the other person (their marker is at 2).
    expect(text).toContain('Read');
    // Opening a conversation reads it.
    expect(callsTo('POST', `${DIRECT}/read`).length).toBeGreaterThan(0);
  });

  it('sends what was written, and shows it', async () => {
    const routes: Record<string, Answer> = {
      ...everything,
      [`POST ${DIRECT}/messages`]: ({ body }) => message(4, true, (body as { body: string }).body),
    };
    world.routes = routes;
    const drawn = await draw(<ThreadScreen kind="direct" id="c-1" />);
    await fireEvent.changeText(screen.getByLabelText('Message'), '  See you there  ');
    await fireEvent.press(screen.getByLabelText('Send'));
    await settle();
    expect(callsTo('POST', `${DIRECT}/messages`)[0]?.body).toEqual({ body: 'See you there' });
    expect(allText(drawn)).toContain('See you there');
  });

  it('sends nothing when nothing was written', async () => {
    world.routes = everything;
    await draw(<ThreadScreen kind="direct" id="c-1" />);
    await fireEvent.press(screen.getByLabelText('Send'));
    await settle();
    expect(callsTo('POST', `${DIRECT}/messages`)).toHaveLength(0);
  });

  it('answers a message: the reply names what it answers', async () => {
    world.routes = {
      ...everything,
      [`POST ${DIRECT}/messages`]: ({ body }) => message(4, true, (body as { body: string }).body),
    };
    const drawn = await draw(<ThreadScreen kind="direct" id="c-1" />);
    await openMenu(0);
    await fireEvent.press(screen.getByLabelText('Reply'));
    await settle(2);
    expect(allText(drawn)).toContain('Replying to Dana Levi');
    await fireEvent.changeText(screen.getByLabelText('Message'), 'Yes');
    await fireEvent.press(screen.getByLabelText('Send'));
    await settle();
    expect(callsTo('POST', `${DIRECT}/messages`)[0]?.body).toEqual({
      body: 'Yes',
      replyToId: 'msg-1',
    });
  });

  it('offers on someone else’s message what a member may do, and no more', async () => {
    world.routes = everything;
    await draw(<ThreadScreen kind="direct" id="c-1" />);
    await openMenu(0);
    expect(offered('Reply')).toBe(true);
    expect(offered('Forward')).toBe(true);
    expect(offered('Copy text')).toBe(true);
    expect(offered('Report')).toBe(true);
    expect(offered('Edit')).toBe(false);
    expect(offered('Delete for everyone')).toBe(false);
    expect(offered('Remove (moderator)')).toBe(false);
  });

  it('offers editing and deleting on the reader’s own message, and no report', async () => {
    world.routes = everything;
    await draw(<ThreadScreen kind="direct" id="c-1" />);
    await openMenu(1);
    expect(offered('Edit')).toBe(true);
    expect(offered('Delete for everyone')).toBe(true);
    expect(offered('Report')).toBe(false);
  });

  it('adds a reaction to a message', async () => {
    world.routes = {
      ...everything,
      'PUT /api/v1/chat/messages/msg-1/reactions/heart': message(1, false, 'Good morning', {
        reactions: [{ reaction: 'heart', count: 1, mine: true }],
      }),
    };
    await draw(<ThreadScreen kind="direct" id="c-1" />);
    await openMenu(0);
    await fireEvent.press(screen.getByLabelText('Heart'));
    await settle();
    expect(callsTo('PUT', '/api/v1/chat/messages/msg-1/reactions/heart')).toHaveLength(1);
    expect(screen.getByLabelText('Heart: 1, including yours')).toBeTruthy();
  });

  it('has no box to write in when the reader blocked the other person, and says why', async () => {
    world.routes = {
      ...everything,
      [`GET ${DIRECT}`]: { ...conversation, sendState: 'blocked', blockedByMe: true },
    };
    const drawn = await draw(<ThreadScreen kind="direct" id="c-1" />);
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(allText(drawn)).toContain('You blocked this person');
  });
});

describe('a room', () => {
  it('gives its moderator the moderation tools', async () => {
    world.routes = everything;
    await draw(<ThreadScreen kind="room" id="r-1" />);
    // The oldest message is someone else's, and it is pinned.
    await openMenu(0);
    for (const tool of [
      'Unpin',
      'Remove (moderator)',
      'Remove the writer from the room',
      'Ban the writer from the room',
    ]) {
      expect(offered(tool)).toBe(true);
    }
    expect(offered('Pin')).toBe(false);
  });

  it('gives a plain member none of them', async () => {
    world.routes = {
      ...everything,
      [`GET ${ROOM}`]: { ...room, role: 'MEMBER', canModerate: false },
    };
    await draw(<ThreadScreen kind="room" id="r-1" />);
    await openMenu(0);
    for (const tool of ['Pin', 'Unpin', 'Remove (moderator)', 'Ban the writer from the room']) {
      expect(offered(tool)).toBe(false);
    }
    expect(offered('Report')).toBe(true);
  });

  it('shows only its door to someone who has not joined, and asks for no messages', async () => {
    world.routes = {
      ...everything,
      [`GET ${ROOM}`]: { ...room, role: 'NONE', canModerate: false, sendState: 'notJoined' },
    };
    const drawn = await draw(<ThreadScreen kind="room" id="r-1" />);
    expect(allText(drawn)).toContain('Join this room to read it and write in it.');
    expect(callsTo('GET', `${ROOM}/messages`)).toHaveLength(0);
    expect(screen.queryByLabelText('Message')).toBeNull();
  });
});
