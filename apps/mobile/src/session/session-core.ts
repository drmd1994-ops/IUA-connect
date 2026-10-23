import { ApiError, toApiError } from '@medconnect/api-client';

/**
 * The app's session (docs/plans/M14-mobile-app.md §4). The server has a sign-in path for apps:
 * the refresh token arrives in the answer, and this module keeps it in the phone's secure
 * storage and nowhere else. The short-lived access token lives in memory only.
 *
 * Nothing here knows about React or the phone: storage and network are handed in, so the rules
 * are tested without either.
 */

/** The phone's secure storage (Keystore on Android, Keychain on iPhone). */
export interface SecureStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const REFRESH_KEY = 'iua.refreshToken';
export const DEVICE_KEY = 'iua.deviceToken';

/**
 * - loading: not yet known (the app just opened).
 * - signedOut: nobody is signed in.
 * - signedIn: a session exists and the server accepted it.
 * - unreachable: a session is stored, and the server could not be asked about it.
 */
export type SessionStatus = 'loading' | 'signedOut' | 'signedIn' | 'unreachable';

export interface SessionOptions {
  /** The API's address, without a path: "http://192.168.1.20:4000". */
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  store: SecureStore;
  /** What the phone is called in "my sessions" on the site. */
  deviceName: string;
  locale: () => string;
  onStatus?: (status: SessionStatus) => void;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  deviceToken?: string;
}

/** The second step of a sign-in: the account has an authenticator, and its code is asked for. */
export interface CodeNeeded {
  mfaToken: string;
  /** What the account can finish with: the authenticator's code, a passkey, or both. */
  methods: ('totp' | 'passkey')[];
}

/** The phone's passkey prompt: the server's options in, the phone's answer out (M18b). */
export type PasskeyPrompt = (options: Record<string, unknown>) => Promise<Record<string, unknown>>;

export class Session {
  private access: string | undefined;
  private current: SessionStatus = 'loading';
  /** One refresh at a time: two would each use the token up, and the second would end the session. */
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly options: SessionOptions) {}

  get status(): SessionStatus {
    return this.current;
  }

  /** The access token for the next request, if there is one. Never stored. */
  accessToken(): string | undefined {
    return this.access;
  }

  /** When the app opens: a stored session is renewed; without one, nobody is signed in. */
  async restore(): Promise<SessionStatus> {
    if (!(await this.options.store.get(REFRESH_KEY))) return this.set('signedOut');
    await this.refresh();
    return this.current;
  }

  /**
   * Signs in with email and password. Answers null when that was enough, or the challenge for
   * the authenticator code. A wrong password, a locked or a disabled account throw ApiError.
   */
  async signIn(email: string, password: string): Promise<CodeNeeded | null> {
    const deviceToken = await this.options.store.get(DEVICE_KEY);
    const body = await this.post('/api/v1/auth/login', {
      email,
      password,
      ...this.asApp(deviceToken),
    });
    // The server did not know this phone: it is remembered, so the next sign-in is not "new".
    if (typeof body.deviceToken === 'string') {
      await this.options.store.set(DEVICE_KEY, body.deviceToken);
    }
    if (body.mfaRequired === true && typeof body.mfaToken === 'string') {
      const methods = Array.isArray(body.mfaMethods)
        ? (body.mfaMethods as CodeNeeded['methods'])
        : ['totp' as const];
      return { mfaToken: body.mfaToken, methods };
    }
    await this.accept(body);
    return null;
  }

  /**
   * Signs in with one of the site's passkeys on this phone (M18b). It counts as both steps, so it
   * also finishes a sign-in that asked for a second step.
   */
  async signInWithPasskey(prompt: PasskeyPrompt): Promise<void> {
    const options = await this.post('/api/v1/auth/passkeys/authentication/options', {});
    const response = await prompt(options);
    const deviceToken = await this.options.store.get(DEVICE_KEY);
    const body = await this.post('/api/v1/auth/passkeys/authentication/verify', {
      response,
      ...this.asApp(deviceToken),
    });
    if (typeof body.deviceToken === 'string') {
      await this.options.store.set(DEVICE_KEY, body.deviceToken);
    }
    await this.accept(body);
  }

  /** The second step: the code from the authenticator app, or a recovery code. */
  async verifyCode(mfaToken: string, code: string): Promise<void> {
    const deviceToken = await this.options.store.get(DEVICE_KEY);
    await this.accept(
      await this.post('/api/v1/auth/mfa/verify', { mfaToken, code, ...this.asApp(deviceToken) }),
    );
  }

  /**
   * Renews the session. True when it worked. A refusal by the server ends the session here
   * too; a network failure leaves it stored, to be tried again.
   */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.renew().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Signs out: the server ends the session, and the phone forgets it whatever the server says. */
  async signOut(): Promise<void> {
    const refreshToken = await this.options.store.get(REFRESH_KEY);
    this.access = undefined;
    await this.options.store.remove(REFRESH_KEY);
    this.set('signedOut');
    if (!refreshToken) return;
    try {
      await this.post('/api/v1/auth/app/logout', { refreshToken });
    } catch {
      // Not reachable now: the session ends on the server when it is next refused or runs out.
    }
  }

  /**
   * A request as the signed-in person. When the access token ran out, the session is renewed
   * and the request is sent once more.
   */
  async fetch(input: string, init: RequestInit = {}): Promise<Response> {
    const send = () =>
      this.options.fetch(`${this.options.baseUrl}${input}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...(this.access ? { Authorization: `Bearer ${this.access}` } : {}),
          'Accept-Language': this.options.locale(),
        },
      });
    const response = await send();
    if (response.status !== 401 || !(await this.refresh())) return response;
    return send();
  }

  private async renew(): Promise<boolean> {
    const refreshToken = await this.options.store.get(REFRESH_KEY);
    if (!refreshToken) {
      this.set('signedOut');
      return false;
    }
    let body: Record<string, unknown>;
    try {
      body = await this.post('/api/v1/auth/app/refresh', { refreshToken });
    } catch (error) {
      if (error instanceof ApiError && error.status < 500 && error.status !== 429) {
        // The server no longer knows this session: it was ended, ran out, or was signed out.
        this.access = undefined;
        await this.options.store.remove(REFRESH_KEY);
        this.set('signedOut');
      } else {
        this.set('unreachable');
      }
      return false;
    }
    await this.accept(body);
    return true;
  }

  /** Takes the tokens of an answer: the refresh token to secure storage, the access token to memory. */
  private async accept(body: Record<string, unknown>): Promise<void> {
    const tokens = body as Partial<Tokens>;
    if (typeof tokens.accessToken !== 'string' || typeof tokens.refreshToken !== 'string') {
      throw new Error('The server answered a sign-in without tokens');
    }
    await this.options.store.set(REFRESH_KEY, tokens.refreshToken);
    this.access = tokens.accessToken;
    this.set('signedIn');
  }

  private asApp(deviceToken: string | null) {
    return {
      client: 'app',
      deviceName: this.options.deviceName,
      ...(deviceToken ? { deviceToken } : {}),
    };
  }

  private async post(path: string, body: object): Promise<Record<string, unknown>> {
    const response = await this.options.fetch(`${this.options.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': this.options.locale() },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }
    if (!response.ok) throw toApiError(response.status, parsed, response.headers);
    return parsed as Record<string, unknown>;
  }

  private set(status: SessionStatus): SessionStatus {
    if (status !== this.current) {
      this.current = status;
      this.options.onStatus?.(status);
    }
    return status;
  }
}
