import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { ChatEventsProvider } from '@/chat/events';
import { API_URL } from '@/config';
import { LanguageChoice } from '@/features/language-choice';
import { SignIn } from '@/features/sign-in';
import { I18nProvider } from '@/i18n/i18n-provider';
import { AppLock } from '@/lock/app-lock';
import { SessionProvider, useSession } from '@/session/session-provider';
import { Body, Button, Notice, Screen, Title } from '@/ui/kit';

/** The app's frame: language, the session, and the lock, around every screen. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <AppLock>
            <Gate />
          </AppLock>
        </SessionProvider>
      </I18nProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

/**
 * Nothing of the member's screens is shown, or even started, without a session: a visitor sees
 * the sign-in screen at every address of the app.
 */
function Gate() {
  const t = useTranslations('mobile');
  const { session, status } = useSession();

  // The tabs, and over them the screens opened from a tab; the phone's back button returns.
  if (status === 'signedIn') {
    return (
      <ChatEventsProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ChatEventsProvider>
    );
  }
  if (status === 'signedOut') return <SignIn />;
  if (status === 'unreachable') {
    return (
      <Screen>
        <Title>{t('unreachable.title')}</Title>
        <Notice tone="warning">{t('unreachable.text', { address: API_URL })}</Notice>
        <Button label={t('unreachable.retry')} onPress={() => void session.restore()} />
        <Button
          label={t('account.signOut')}
          variant="secondary"
          onPress={() => void session.signOut()}
        />
        <LanguageChoice />
      </Screen>
    );
  }
  return (
    <Screen>
      <Body muted>{t('loading')}</Body>
    </Screen>
  );
}
