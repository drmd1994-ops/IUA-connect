import { type Locale, directionOf, getMessages, isLocale } from '@iua/i18n';
import * as Localization from 'expo-localization';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { IntlProvider } from 'use-intl';
import { secureStore } from '@/session/secure-store';
import { startingLocale } from './locale';
import { installPluralRules } from './plural-rules';

// Before any text is written: the phone's engine has no plural rule of its own.
installPluralRules();

const LOCALE_KEY = 'iua.locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * The language asks for the other direction than the one the app was laid out in. A phone
   * applies a change of direction only when the app starts, so the app must be reopened.
   */
  needsRestart: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * The app's language: the one the member chose, else the phone's when it is Hebrew or English,
 * else Hebrew (plan §4). The texts are the site's own, from the shared package.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    startingLocale(Localization.getLocales().map((entry) => entry.languageCode)),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    secureStore
      .get(LOCALE_KEY)
      .then((stored) => {
        if (active && isLocale(stored)) setLocaleState(stored);
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  const wantsRtl = directionOf(locale) === 'rtl';
  useEffect(() => {
    if (!ready) return;
    I18nManager.allowRTL(true);
    // Takes effect the next time the app starts.
    if (I18nManager.isRTL !== wantsRtl) I18nManager.forceRTL(wantsRtl);
  }, [ready, wantsRtl]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    secureStore.set(LOCALE_KEY, next).catch(() => undefined);
  }, []);

  if (!ready) return null;
  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, needsRestart: I18nManager.isRTL !== wantsRtl }}
    >
      <IntlProvider locale={locale} messages={getMessages(locale)} timeZone="Asia/Jerusalem">
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleSettings(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocaleSettings needs an I18nProvider above it');
  return value;
}

export function useLocale(): Locale {
  return useLocaleSettings().locale;
}
