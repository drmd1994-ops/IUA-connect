import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import { JournalClubEntryScreen, JournalClubScreen } from './journal-club';

/** M31: the journal club in the app. The entries and articles are made up. */
describe('the journal club in the app', () => {
  it('shows this month’s entry first, then the archive', async () => {
    world.routes = everything;
    const text = allText(await draw(<JournalClubScreen />));
    expect(text).toContain('This month');
    expect(text).toContain('A made-up study of simulator practice');
    expect(text).toContain('Earlier entries');
    expect(text).toContain('Closed');
  });

  it('tells someone not verified how to get there', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/journal-club': () => {
        throw new Refuse(403, 'FORBIDDEN', [{ code: 'membersOnly' }]);
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<JournalClubScreen />, 'he'));
    expect(text).toContain('מועדון העיתונות פתוח למי שהחשבון שלו/ה אומת');
  });

  it('shows the entry with its authors, answers the poll and shows the totals', async () => {
    world.routes = everything;
    const drawn = await draw(<JournalClubEntryScreen id="jc-1" />);
    const text = allText(drawn);
    expect(text).toContain('Summary by Rana Haddad, Sample Hospital');
    expect(text).toContain('The article itself is not copied here');
    expect(text).not.toContain('answers');
    await fireEvent.press(screen.getByLabelText('Yes'));
    await settle();
    expect(callsTo('PUT', '/api/v1/journal-club/jc-1/vote')[0]?.body).toEqual({ answer: 'YES' });
    expect(allText(drawn)).toContain('Your answer: Yes. You can change it.');
    expect(allText(drawn)).toContain('Yes: 75%');
  });

  it('opens the discussion in the community', async () => {
    world.routes = everything;
    await draw(<JournalClubEntryScreen id="jc-1" />);
    await fireEvent.press(screen.getByLabelText('Discuss it in the community'));
    expect(world.pushed.at(-1)).toBe('/communities/andrology/po-1');
  });
});
