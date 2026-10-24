import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, callsTo, world } from '@/testing/world';
import { MemberPage } from './browse';
import {
  ProjectFormScreen,
  ProjectScreen,
  ProjectsScreen,
  PublicationsScreen,
  ResearchRequestsScreen,
} from './research';

/** M27: research projects and publications in the app. The people and projects are fictional. */
describe('research projects in the app', () => {
  it('lists the projects, with what they look for and the ways on', async () => {
    world.routes = everything;
    const text = allText(await draw(<ProjectsScreen />));
    expect(text).toContain('A sample registry of clinic waiting times');
    expect(text).toContain('Looking for: Centres, A statistician');
    expect(text).toContain('Led by Yonatan Barak');
    expect(text).toContain('List a project');
    expect(text).toContain('My publications');
  });

  it('searches by what a project looks for', async () => {
    world.routes = everything;
    await draw(<ProjectsScreen />);
    await fireEvent.press(screen.getByLabelText('Students'));
    await settle();
    expect(
      world.calls.filter((c) => c.path === '/api/v1/research/projects').at(-1)?.query,
    ).toContain('need=STUDENTS');
  });

  it('tells someone not verified how to get there', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/research/projects': () => {
        throw new Refuse(403, 'FORBIDDEN', [{ code: 'membersOnly' }]);
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<ProjectsScreen />, 'he'));
    expect(text).toContain('פרויקטי המחקר פתוחים למי שהחשבון שלו/ה אומת');
  });

  it('shows the ethics approval as declared, and asks to join with a message', async () => {
    world.routes = everything;
    const drawn = await draw(<ProjectScreen id="rp-1" />);
    expect(allText(drawn)).toContain('Ethics approval: approved (declared by the lead)');
    expect(allText(drawn)).toContain('A project listing holds no data about participants.');
    await fireEvent.press(screen.getByLabelText('Ask to join'));
    await fireEvent.changeText(
      screen.getByLabelText('Your message to the lead'),
      'I am a resident and would like to help.',
    );
    await fireEvent.press(screen.getByLabelText('Send the request'));
    await settle();
    expect(callsTo('POST', '/api/v1/research/projects/rp-1/requests')[0]?.body).toEqual({
      message: 'I am a resident and would like to help.',
    });
    expect(allText(drawn)).toContain('Your request was sent.');
  });

  it('lists a new project', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/research/projects': { id: 'rp-9' },
    } as Record<string, Answer>;
    await draw(<ProjectFormScreen />);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A new sample study');
    await fireEvent.changeText(screen.getByLabelText('Description'), 'Looking for centres.');
    await fireEvent.press(screen.getByLabelText('Centres'));
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(callsTo('POST', '/api/v1/research/projects')[0]?.body).toMatchObject({
      title: 'A new sample study',
      description: 'Looking for centres.',
      needs: ['CENTRES'],
      funding: null,
    });
    expect(world.pushed.at(-1)).toBe('/research/rp-9');
  });

  it('accepts a request to the reader’s project', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/research/requests/*': {
        ...(everything['GET /api/v1/research/requests'] as { items: object[] }).items[0],
        state: 'ACCEPTED',
      },
    } as Record<string, Answer>;
    const drawn = await draw(<ResearchRequestsScreen />);
    expect(allText(drawn)).toContain('Yoav Sela, Sample Hospital');
    await fireEvent.press(screen.getByLabelText('Accept'));
    await settle();
    expect(callsTo('POST', '/api/v1/research/requests/rr-1/accept')).toHaveLength(1);
    expect(allText(drawn)).toContain('Accepted');
  });
});

describe('publications in the app', () => {
  it('types a publication in', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/me/publications': {
        ...(everything['GET /api/v1/me/publications'] as { items: object[] }).items[0],
        id: 'pub-2',
        title: 'A typed-in sample paper',
      },
    } as Record<string, Answer>;
    const drawn = await draw(<PublicationsScreen />);
    expect(allText(drawn)).toContain('A fictional review of clinic waiting times');
    await fireEvent.press(screen.getByLabelText('Type it in'));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'A typed-in sample paper');
    await fireEvent.changeText(screen.getByLabelText('Year'), '2025');
    await fireEvent.changeText(screen.getByLabelText('Topics (separated by commas)'), 'a, b');
    await fireEvent.press(screen.getByLabelText('Save'));
    await settle();
    expect(callsTo('POST', '/api/v1/me/publications')[0]?.body).toMatchObject({
      title: 'A typed-in sample paper',
      year: 2025,
      topics: ['a', 'b'],
      source: 'MANUAL',
    });
    expect(allText(drawn)).toContain('A typed-in sample paper');
  });

  it('fills one in from PubMed by its PubMed ID', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/me/publications/lookup': {
        source: 'PUBMED',
        items: [
          {
            title: 'A sample paper from PubMed',
            authors: 'Fictional authors',
            journal: null,
            year: 2023,
            doi: null,
            pmid: '12345',
            url: null,
            saved: false,
          },
        ],
      },
    } as Record<string, Answer>;
    await draw(<PublicationsScreen />);
    await fireEvent.press(screen.getByLabelText('Fill in from PubMed'));
    await fireEvent.changeText(screen.getByLabelText('PubMed ID or DOI'), '12345');
    await fireEvent.press(screen.getByLabelText('Find'));
    await settle();
    expect(callsTo('POST', '/api/v1/me/publications/lookup')[0]?.body).toEqual({ pmid: '12345' });
    expect(screen.getByLabelText('Title').props.value).toBe('A sample paper from PubMed');
  });

  it('lists the ORCID works, marking the one already saved', async () => {
    world.routes = everything;
    const drawn = await draw(<PublicationsScreen />);
    await fireEvent.press(screen.getByLabelText('Choose from my ORCID record'));
    await settle();
    const text = allText(drawn);
    expect(text).toContain('Already saved');
    expect(text).toContain('A second sample paper');
  });

  it('shows a member’s publications on their page', async () => {
    world.routes = everything;
    const text = allText(await draw(<MemberPage id="u-dana" />));
    expect(text).toContain('Publications');
    expect(text).toContain('A fictional review of clinic waiting times');
  });
});
