'use client';

import {
  ApiError,
  type ApiClient,
  type components,
  createApiClient,
  toApiError,
} from '@medconnect/api-client';
import { useLocale } from 'next-intl';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tokenStore } from './token-store';

export type Me = components['schemas']['MeDto'];

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  me: Me | null;
  /** Typed API client; requests carry the in-memory access token. */
  api: ApiClient;
  /**
   * Runs an API call and returns its data. On 401 it refreshes the session once and retries.
   * Non-2xx responses throw ApiError (with an i18n message key).
   */
  call: <T>(request: () => Promise<ApiResult<T>>) => Promise<T>;
  /** After /auth/login or /auth/mfa/verify: keeps the access token and loads the profile. */
  completeSignIn: (accessToken: string) => Promise<Me>;
  signOut: () => Promise<void>;
  reloadMe: () => Promise<void>;
}

export interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CSRF_COOKIE = 'iua_csrf';
const REFRESH_LOCK = 'iua-auth-refresh';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** Throws ApiError unless the response succeeded. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.response.ok || result.error !== undefined) {
    throw toApiError(result.response.status, result.error, result.response.headers);
  }
  return result.data as T;
}

/**
 * Session handling for the browser (ARCHITECTURE.md §9): the access token lives only in memory
 * (token-store.ts); the refresh token is an HttpOnly cookie the page can't read. Refreshes are
 * serialized across tabs with the Web Locks API, because two tabs presenting the same refresh
 * token would trip the server's reuse detection and sign the user out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const api = useMemo(
    () => createApiClient({ baseUrl: '', locale, getAccessToken: tokenStore.get }),
    [locale],
  );

  const forget = useCallback(() => {
    tokenStore.clear();
    setMe(null);
    setStatus('signedOut');
  }, []);

  /** Exchanges the refresh cookie for a new access token. Resolves false when signed out. */
  const refresh = useCallback(
    () =>
      tokenStore.refreshOnce(async () => {
        const attempt = async () => {
          const csrf = readCookie(CSRF_COOKIE);
          if (!csrf) return false;
          const result = await api.POST('/api/v1/auth/refresh', {
            headers: { 'X-CSRF-Token': csrf },
          });
          if (!result.response.ok || !result.data) return false;
          tokenStore.set(result.data.accessToken);
          return true;
        };
        try {
          return navigator.locks
            ? await navigator.locks.request(REFRESH_LOCK, attempt)
            : await attempt();
        } catch {
          return false;
        }
      }),
    [api],
  );

  // Restore the session (if any) when the app loads.
  useEffect(() => {
    let active = true;
    refresh()
      .then(async (ok) => {
        if (!ok) throw new Error('signed out');
        return unwrap(await api.GET('/api/v1/me'));
      })
      .then((profile) => {
        if (!active) return;
        setMe(profile);
        setStatus('signedIn');
      })
      .catch(() => {
        if (active) forget();
      });
    return () => {
      active = false;
    };
  }, [api, refresh, forget]);

  const call = useCallback(
    async <T,>(request: () => Promise<ApiResult<T>>): Promise<T> => {
      const first = await request();
      if (first.response.status !== 401 || !tokenStore.get()) return unwrap(first);
      if (!(await refresh())) {
        forget();
        return unwrap(first);
      }
      return unwrap(await request());
    },
    [refresh, forget],
  );

  const completeSignIn = useCallback(
    async (accessToken: string) => {
      tokenStore.set(accessToken);
      const profile = unwrap(await api.GET('/api/v1/me'));
      setMe(profile);
      setStatus('signedIn');
      return profile;
    },
    [api],
  );

  const signOut = useCallback(async () => {
    const csrf = readCookie(CSRF_COOKIE);
    try {
      await api.POST('/api/v1/auth/logout', { headers: { 'X-CSRF-Token': csrf ?? '' } });
    } finally {
      forget();
    }
  }, [api, forget]);

  const reloadMe = useCallback(async () => {
    setMe(await call(() => api.GET('/api/v1/me')));
  }, [api, call]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, api, call, completeSignIn, signOut, reloadMe }),
    [status, me, api, call, completeSignIn, signOut, reloadMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export { ApiError };
