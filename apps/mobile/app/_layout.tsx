import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '@/i18n/i18n-provider';
import { AppLock } from '@/lock/app-lock';
import { SessionProvider } from '@/session/session-provider';

/** The app's frame: language, the session, and the lock, around every screen. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <AppLock>
            <Slot />
          </AppLock>
        </SessionProvider>
      </I18nProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
