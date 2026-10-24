import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, Refuse, world } from '@/testing/world';
import { CaseScreen } from './cases';
import { ScanViewerScreen } from './imaging';

/** M36: scans in the app. The scan here is made up. */
describe('scans in the app', () => {
  it('shows a case’s scan under the education-only note, and opens it in the app', async () => {
    world.routes = everything;
    const text = allText(await draw(<CaseScreen id="c-1" />));
    expect(text).toContain('For education and discussion only. Not for diagnosis or patient care.');
    expect(text).toContain('CT: 1 series, 24 images');
    await fireEvent.press(screen.getByLabelText('View the scan'));
    expect(world.pushed.at(-1)).toBe('/scans/sc-1');
  });

  it('opens the viewer inside the app with the signed link to that one scan', async () => {
    world.routes = everything;
    await draw(<ScanViewerScreen id="sc-1" />, 'he');
    const view = screen.getByTestId('web-view');
    const address = new URL(view.props.accessibilityHint as string);
    expect(address.pathname).toBe('/viewer/viewer/medconnect');
    expect(address.searchParams.get('url')).toBe(
      '/api/v1/imaging/v/sc-1.1792863423.made-up-signature/config.json',
    );
    expect(address.searchParams.get('lng')).toBe('he');
  });

  it('says so when the scan can’t be opened', async () => {
    world.routes = {
      ...everything,
      'GET /api/v1/imaging/scans/*': () => {
        throw new Refuse(404, 'NOT_FOUND');
      },
    } as Record<string, Answer>;
    const text = allText(await draw(<ScanViewerScreen id="sc-9" />));
    expect(text).toContain('The scan can’t be opened.');
  });
});
