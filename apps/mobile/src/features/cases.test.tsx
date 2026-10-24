import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import { CaseScreen, CasesScreen, MyCasesScreen, WriteCaseScreen } from './cases';

/** M26: case discussions in the app. Every case is made up. */
describe('cases in the app', () => {
  it('shows the case of the week first, with the standing note', async () => {
    world.routes = everything;
    const text = allText(await draw(<CasesScreen />));
    expect(text).toContain('For education. Not advice about a patient.');
    expect(text).toContain('Case of the week');
    expect(text).toContain('A made-up case of flank pain');
    expect(text).toContain('Male, 40 to 64');
    expect(text).toContain('Another made-up case');
  });

  it('tells someone not verified how to get there', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/cases': () => {
        throw new Refuse(403, 'FORBIDDEN', [{ code: 'membersOnly' }]);
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<CasesScreen />, 'he'));
    expect(text).toContain('המקרים פתוחים למי שהחשבון שלו/ה אומת');
  });

  it('shows the author’s own case with the moderator’s reason', async () => {
    world.routes = everything;
    const text = allText(await draw(<MyCasesScreen />));
    expect(text).toContain('My made-up case');
    expect(text).toContain('Returned to you');
  });

  it('answers the poll and shows the totals; opens the discussion', async () => {
    world.routes = everything;
    const drawn = await draw(<CaseScreen id="c-1" />);
    expect(allText(drawn)).toContain('Presented by Yoav Sela');
    await fireEvent.press(screen.getByLabelText('Watch and wait'));
    await settle();
    expect(callsTo('PUT', '/api/v1/cases/c-1/vote')[0]?.body).toEqual({ optionId: 'o-1' });
    expect(allText(drawn)).toContain('Watch and wait: 75%');
    await fireEvent.press(screen.getByLabelText('Discuss it in the community'));
    expect(world.pushed.at(-1)).toBe('/communities/andrology/po-1');
  });

  it('reports a case, which hides it', async () => {
    world.routes = everything;
    const drawn = await draw(<CaseScreen id="c-1" />);
    await fireEvent.press(screen.getByLabelText('Report this case'));
    await fireEvent.changeText(screen.getByLabelText('What is wrong with it'), 'A made-up report.');
    await fireEvent.press(screen.getByLabelText('Send the report'));
    await settle();
    expect(callsTo('POST', '/api/v1/cases/c-1/report')[0]?.body).toEqual({
      reason: 'A made-up report.',
    });
    expect(allText(drawn)).toContain('The case is hidden until a moderator looks at it.');
  });

  it('stops a case with an ID number before sending, and sends a clean one', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/cases': { ...(everything['GET /api/v1/cases/*'] as object), id: 'c-9' },
    } as Record<string, Answer>;
    const drawn = await draw(<WriteCaseScreen />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A made-up case');
    await fireEvent.press(screen.getByLabelText('Urologic oncology'));
    await fireEvent.press(screen.getByLabelText('40 to 64'));
    await fireEvent.press(screen.getByLabelText('Female'));
    await fireEvent.changeText(
      screen.getByLabelText('Presenting problem and history'),
      'ID 123456782, a made-up case.',
    );
    await fireEvent.changeText(screen.getByLabelText('Your question to colleagues'), 'What next?');
    expect(allText(drawn)).toContain('123456782');
    await fireEvent.press(screen.getByLabelText('Save as a draft'));
    await settle();
    expect(callsTo('POST', '/api/v1/cases')).toHaveLength(0);
    await fireEvent.changeText(
      screen.getByLabelText('Presenting problem and history'),
      'A made-up case, no details.',
    );
    await fireEvent.press(screen.getByLabelText('Save as a draft'));
    await settle();
    expect(callsTo('POST', '/api/v1/cases')[0]?.body).toMatchObject({
      title: 'A made-up case',
      ageRange: 'FROM_40_TO_64',
      sex: 'FEMALE',
      pollOptions: [],
      fileIds: [],
    });
    expect(world.pushed.at(-1)).toBe('/cases/c-9');
  });
});
