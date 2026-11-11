import { render, waitFor } from '@testing-library/react-native';
import { Platform, Settings } from 'react-native';

// The shared setup replaces this module for the screens; here the real one is tested.
jest.unmock('@/i18n/i18n-provider');
const { I18nProvider } = jest.requireActual<typeof import('./i18n-provider')>('./i18n-provider');

const { kept } = jest.requireMock('@/session/secure-store') as { kept: Map<string, string> };

describe('the language iOS is told (M37)', () => {
  beforeEach(() => {
    kept.clear();
    jest.spyOn(Settings, 'set').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('on an iPhone, tells iOS the language chosen in the app, so text and prompts follow it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    kept.set('iua.locale', 'he');
    await render(<I18nProvider>{null}</I18nProvider>);
    await waitFor(() => expect(Settings.set).toHaveBeenCalledWith({ AppleLanguages: ['he'] }));
  });

  it('on Android, leaves it alone', async () => {
    kept.set('iua.locale', 'he');
    await render(<I18nProvider>{null}</I18nProvider>);
    await waitFor(() => expect(kept.get('iua.locale')).toBe('he'));
    expect(Settings.set).not.toHaveBeenCalled();
  });
});
