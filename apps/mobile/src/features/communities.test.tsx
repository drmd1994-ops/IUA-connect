import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import { CommunitiesScreen, CommunityScreen, PostScreen, WritePostScreen } from './communities';

/** M25: communities in the app. The people and posts are fictional. */
describe('communities in the app', () => {
  it('lists the communities and the feed', async () => {
    world.routes = everything;
    const drawn = await draw(<CommunitiesScreen />);
    expect(allText(drawn)).toContain('Andrology');
    expect(allText(drawn)).toContain('Following');
    await fireEvent.press(screen.getByLabelText('From communities I follow'));
    await settle();
    expect(allText(drawn)).toContain('Rotation timetables');
  });

  it('tells a person who is not verified how to get there', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/communities': () => {
        throw new Refuse(403, 'FORBIDDEN', [{ code: 'membersOnly' }]);
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<CommunitiesScreen />));
    expect(text).toContain('Communities are open to people whose account has been verified');
  });

  it('shows a community with its moderators, and follows it', async () => {
    world.routes = { ...everything, 'DELETE /api/v1/communities/andrology/follow': {} };
    const drawn = await draw(<CommunityScreen slug="andrology" />);
    expect(allText(drawn)).toContain('Moderators: Noa Bar-Lev');
    await fireEvent.press(screen.getByLabelText('Stop following'));
    await settle();
    expect(callsTo('DELETE', '/api/v1/communities/andrology/follow')).toHaveLength(1);
  });

  it('stops a post with an ID number before it is sent, then posts it', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/communities/andrology/posts': () => ({ id: 'po-9' }),
    } as Record<string, Answer>;
    const drawn = await draw(<WritePostScreen slug="andrology" />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Rotation timetables');
    await fireEvent.changeText(screen.getByLabelText('Text'), 'My ID is 123456782.');
    expect(allText(drawn)).toContain('“123456782”: an ID number');
    await fireEvent.press(screen.getByLabelText('Post'));
    await settle();
    expect(callsTo('POST', '/api/v1/communities/andrology/posts')).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText('Text'), 'How do others plan the rotation?');
    await fireEvent.press(screen.getByLabelText('Post'));
    await settle();
    expect(callsTo('POST', '/api/v1/communities/andrology/posts')[0]?.body).toMatchObject({
      kind: 'DISCUSSION',
      title: 'Rotation timetables',
      body: 'How do others plan the rotation?',
    });
    expect(world.pushed).toContain('/communities/andrology/po-9');
  });

  it('lets a question’s writer mark the answer, and comments', async () => {
    const post = everything['GET /api/v1/posts/*'] as Record<string, unknown>;
    world.routes = {
      ...everything,
      'PUT /api/v1/posts/po-1/answer': () => ({ ...post, answered: true }),
      'POST /api/v1/posts/po-1/comments': () => post,
    } as Record<string, Answer>;
    const drawn = await draw(<PostScreen id="po-1" />, 'he');
    expect(allText(drawn)).toContain('Two blocks of six weeks.');
    await fireEvent.press(screen.getByLabelText('סימון כתשובה'));
    await settle();
    expect(callsTo('PUT', '/api/v1/posts/po-1/answer')[0]?.body).toEqual({ commentId: 'pc-1' });
    await fireEvent.changeText(screen.getByLabelText('התגובה שלך'), 'תודה רבה.');
    await fireEvent.press(screen.getByLabelText('שליחה'));
    await settle();
    expect(callsTo('POST', '/api/v1/posts/po-1/comments')[0]?.body).toEqual({
      body: 'תודה רבה.',
      mentions: [],
    });
  });
});
