import { type ApiError, toApiError } from '@iua/api-client';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { API_URL, deviceName } from '@/config';
import { useLocale } from '@/i18n/i18n-provider';
import { secureStore } from './secure-store';
import { Session, type SessionStatus } from './session-core';

interface SessionContextValue {
  session: Session;
  status: SessionStatus;
  /** Asks the API as the signed-in person and reads the JSON answer; throws ApiError. */
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** The one session of the app, restored from the phone's secure storage when the app opens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [status, setStatus] = useState<SessionStatus>('loading');
  // The locale is read at the moment of each request, so the session itself never changes.
  const [language] = useState(() => ({ current: locale }));
  language.current = locale;
  const session = useMemo(
    () =>
      new Session({
        baseUrl: API_URL,
        fetch: globalThis.fetch.bind(globalThis),
        store: secureStore,
        deviceName: deviceName(),
        locale: () => language.current,
        onStatus: setStatus,
      }),
    [language],
  );

  useEffect(() => {
    void session.restore();
  }, [session]);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await session.fetch(path, init);
      const text = await response.text();
      let body: unknown = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
      if (!response.ok) throw toApiError(response.status, body, response.headers);
      return body as T;
    },
    [session],
  );

  const value = useMemo(() => ({ session, status, request }), [session, status, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider above it');
  return value;
}

export type { ApiError };
