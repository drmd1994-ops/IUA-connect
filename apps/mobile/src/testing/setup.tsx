/* eslint-disable @typescript-eslint/no-require-imports */
import { resetWorld } from './world';

/**
 * What stands in for the phone and the network while a screen is drawn in a test. The screens
 * themselves, their texts and their rules are the real ones.
 */

jest.mock('@/session/session-provider', () => {
  const { world, request } = require('@/testing/world');
  return { useSession: () => ({ session: world.session, status: 'signedIn', request }) };
});

jest.mock('@/i18n/i18n-provider', () => {
  const { world } = require('@/testing/world');
  return {
    useLocale: () => world.locale,
    useLocaleSettings: () => ({ locale: world.locale, setLocale: jest.fn(), needsRestart: false }),
  };
});

jest.mock('@/lock/app-lock', () => ({
  useAppLock: () => ({ available: true, enabled: true, setEnabled: jest.fn() }),
}));

jest.mock('@/session/secure-store', () => {
  const kept = new Map<string, string>();
  return {
    secureStore: {
      get: async (key: string) => kept.get(key) ?? null,
      set: async (key: string, value: string) => void kept.set(key, value),
      remove: async (key: string) => void kept.delete(key),
    },
    kept,
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const { world } = require('@/testing/world');
  const go = (to: unknown) => world.pushed.push(typeof to === 'string' ? to : JSON.stringify(to));
  const router = {
    push: go,
    replace: go,
    navigate: go,
    back: () => world.pushed.push('(back)'),
    canGoBack: () => true,
  };
  return {
    useRouter: () => router,
    useLocalSearchParams: () => world.params,
    // A screen in a test is always the one in front: what it does on return, it does once.
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Plain = ({ children, ...rest }: { children?: unknown }) =>
    React.createElement(View, rest, children);
  return {
    SafeAreaProvider: Plain,
    SafeAreaView: Plain,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('expo/fetch', () => ({ fetch: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri = 'file:///cache/test.ics';
    exists = false;
    create() {}
    delete() {}
    write() {}
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: (props: object) => React.createElement(View, props),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  resetWorld();
  // The app is in front, as when someone is looking at it.
  (require('react-native').AppState as { currentState: string }).currentState = 'active';
});
