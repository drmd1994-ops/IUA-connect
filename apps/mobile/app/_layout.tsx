import { type Href, Stack, useRootNavigationState, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { ChatEventsProvider } from '@/chat/events';
import { API_URL } from '@/config';
import { pendingLink } from '@/features/app-links';
import { ReminderKeeper } from '@/features/events';
import { GuestEntry } from '@/features/events-live';
import { clearReminders } from '@/features/session-reminders';
import { LanguageChoice } from '@/features/language-choice';
import { SignIn } from '@/features/sign-in';
import {
  ForgotPassword,
  GuestProvider,
  Register,
  ResetPassword,
  VerifyEmail,
} from '@/features/visitor';
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
 * Nobody is signed in. The sign-in screen leads to a forgotten password, to opening an account,
 * and to the pages that are open to everyone, which need no account.
 */
function Visitor() {
  const [mode, setMode] = useState<'signIn' | 'forgot' | 'register' | 'guest'>('signIn');
  const back = () => setMode('signIn');
  if (mode === 'guest') {
    return (
      <GuestProvider toSignIn={back}>
        <Stack screenOptions={{ headerShown: false }} />
      </GuestProvider>
    );
  }
  if (mode === 'forgot') return <ForgotPassword onBack={back} />;
  if (mode === 'register') return <Register onBack={back} />;
  return (
    <SignIn
      onForgot={() => setMode('forgot')}
      onRegister={() => setMode('register')}
      onGuest={() => setMode('guest')}
    />
  );
}

/**
 * Nothing of the member's screens is shown, or even started, without a session: a visitor sees
 * the sign-in screen at every address of the app, unless they chose to read the open pages.
 */
function Gate() {
  const t = useTranslations('mobile');
  const { session, status } = useSession();
  const link = useSyncExternalStore(pendingLink.subscribe, pendingLink.get);

  // Signed out: the phone stops reminding of that person's sessions (M32).
  useEffect(() => {
    if (status === 'signedOut') void clearReminders().catch(() => undefined);
  }, [status]);

  // A conference's guest link (M32). Signed in already: that account goes to the event.
  useEffect(() => {
    if (link?.kind === 'guestEntry' && status === 'signedIn') {
      pendingLink.set({ kind: 'screen', route: `/events/${encodeURIComponent(link.slug)}` });
    }
  }, [link, status]);
  if (link?.kind === 'guestEntry') {
    if (status === 'signedOut') {
      return (
        <GuestEntry slug={link.slug} code={link.code} onCancel={() => pendingLink.set(null)} />
      );
    }
    return (
      <Screen>
        <Body muted>{t('loading')}</Body>
      </Screen>
    );
  }

  // A link from an email with a one-time token (M18b): its own screen, signed in or not.
  if (link && link.kind !== 'screen' && status !== 'loading') {
    const done = () => pendingLink.set(null);
    return link.kind === 'verifyEmail' ? (
      <VerifyEmail token={link.token} onDone={done} />
    ) : (
      <ResetPassword token={link.token} onDone={done} />
    );
  }

  // The tabs, and over them the screens opened from a tab; the phone's back button returns.
  if (status === 'signedIn') return <SignedIn />;
  if (status === 'signedOut') return <Visitor />;
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

/**
 * A conference guest (M32) is signed in, but the server refuses them everything except their
 * event's live part: they get the open pages as a visitor does, and go straight to the event.
 */
function SignedIn() {
  const t = useTranslations('mobile');
  const { session, request } = useSession();
  const router = useRouter();
  const ready = Boolean(useRootNavigationState()?.key);
  const [me, setMe] = useState<{ guest: { number: number; eventSlug: string } | null } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    request<{ guest: { number: number; eventSlug: string } | null }>('/api/v1/me')
      .then((result) => active && setMe(result))
      // Unknown, as when there is no connection: the member's screens say so themselves.
      .catch(() => active && setMe({ guest: null }));
    return () => {
      active = false;
    };
  }, [request]);
  const guest = me?.guest;
  useEffect(() => {
    if (ready && guest) router.replace(`/events/${encodeURIComponent(guest.eventSlug)}` as Href);
  }, [ready, guest, router]);
  if (!me) {
    return (
      <Screen>
        <Body muted>{t('loading')}</Body>
      </Screen>
    );
  }
  if (guest) {
    return (
      <GuestProvider
        toSignIn={() => void session.signOut()}
        conference={{ slug: guest.eventSlug, number: guest.number }}
      >
        <Stack screenOptions={{ headerShown: false }} />
      </GuestProvider>
    );
  }
  return (
    <ChatEventsProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <OpenLink />
      <ReminderKeeper />
    </ChatEventsProvider>
  );
}

/**
 * Signed in, a link from an email (M18b) opens its screen once the screens are ready. A link that
 * came while signed out waits here for the sign-in.
 */
function OpenLink() {
  const router = useRouter();
  const ready = Boolean(useRootNavigationState()?.key);
  const link = useSyncExternalStore(pendingLink.subscribe, pendingLink.get);
  useEffect(() => {
    if (!ready || link?.kind !== 'screen') return;
    pendingLink.take();
    router.push(link.route as Href);
  }, [ready, link, router]);
  return null;
}
