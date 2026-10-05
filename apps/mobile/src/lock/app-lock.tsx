import * as LocalAuthentication from 'expo-local-authentication';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useTranslations } from 'use-intl';
import { secureStore } from '@/session/secure-store';
import { useSession } from '@/session/session-provider';
import { Body, Button, Notice, Screen, Title } from '@/ui/kit';
import { shouldLock } from './lock-rules';

const LOCK_KEY = 'iua.appLock';

interface LockContextValue {
  /** The member wants the phone's fingerprint or face check when the app opens. */
  enabled: boolean;
  /** The phone has a fingerprint or a face set up. */
  available: boolean;
  setEnabled: (enabled: boolean) => void;
}

const LockContext = createContext<LockContextValue | null>(null);

/**
 * The app's lock (plan, owner answer 4): once signed in, the phone's own fingerprint or face
 * check is asked for each time the app is opened, and again after it was in the background
 * for a while. It is the phone's lock, not a second sign-in: the app only learns "yes" or
 * "no". A phone with no fingerprint or face set up opens without asking.
 */
export function AppLock({ children }: { children: ReactNode }) {
  const t = useTranslations('mobile.lock');
  const a = useTranslations('mobile.account');
  const { session, status } = useSession();
  const [enabled, setEnabledState] = useState(true);
  const [available, setAvailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [failed, setFailed] = useState(false);
  const leftAt = useRef<number | null>(null);
  const asking = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      secureStore.get(LOCK_KEY),
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ])
      .then(([stored, hardware, enrolled]) => {
        if (!active) return;
        setEnabledState(stored !== 'off');
        setAvailable(hardware && enrolled);
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  // Back from the background after a while: locked again.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt.current = Date.now();
      } else if (state === 'active') {
        if (shouldLock(leftAt.current, Date.now())) setLocked(true);
        leftAt.current = null;
      }
    });
    return () => subscription.remove();
  }, []);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('prompt'),
        // The phone's own PIN or pattern is accepted too, as the phone's lock screen does.
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      asking.current = false;
    }
  }, [t]);

  const active = ready && enabled && available && status === 'signedIn';
  useEffect(() => {
    if (active && locked) void unlock();
  }, [active, locked, unlock]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    secureStore.set(LOCK_KEY, next ? 'on' : 'off').catch(() => undefined);
  }, []);

  if (!ready) return null;
  return (
    <LockContext.Provider value={{ enabled, available, setEnabled }}>
      {active && locked ? (
        <Screen>
          <Title>{t('title')}</Title>
          {failed && <Notice tone="warning">{t('failed')}</Notice>}
          <Button label={t('unlock')} onPress={() => void unlock()} />
          <Button label={a('signOut')} variant="secondary" onPress={() => void session.signOut()} />
          <Body muted>{t('settingHint')}</Body>
        </Screen>
      ) : (
        children
      )}
    </LockContext.Provider>
  );
}

export function useAppLock(): LockContextValue {
  const value = useContext(LockContext);
  if (!value) throw new Error('useAppLock needs an AppLock above it');
  return value;
}
