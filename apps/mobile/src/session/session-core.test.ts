import { ApiError } from '@iua/api-client';
import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, REFRESH_KEY, type SecureStore, Session } from './session-core';

/** A pretend secure storage that remembers everything ever written to it. */
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  const store: SecureStore = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
  return { store, values, writes };
}

type Answer = { status: number; body?: unknown } | Error;

/** A pretend server: answers by path, in order, and remembers every request. */
function server(answers: Record<string, Answer[]>) {
  const requests: {
    path: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://api.test', '');
    requests.push({
      path,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const answer = answers[path]?.shift();
    if (!answer) throw new Error(`No answer prepared for ${path}`);
    if (answer instanceof Error) throw answer;
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const tokens = (n: number) => ({
  status: 200,
  body: {
    accessToken: `access-${n}`,
    expiresIn: 600,
    refreshToken: `refresh-${n}`,
    sessionExpiresAt: '2026-12-01T00:00:00.000Z',
  },
});
const refused = (status: number, code: string) => ({
  status,
  body: { error: { code, message: `errors.${code}`, correlationId: 'c' } },
});

function make(
  answers: Record<string, Answer[]>,
  kept: Record<string, string> = {},
  statuses: string[] = [],
) {
  const { store, values, writes } = storage(kept);
  const { fetch, requests } = server(answers);
  const session = new Session({
    baseUrl: 'http://api.test',
    fetch,
    store,
    deviceName: 'Pixel 9',
    locale: () => 'he',
    onStatus: (status) => statuses.push(status),
  });
  return { session, values, writes, requests, statuses };
}

describe('the app session', () => {
  it('signs in as an app and keeps the refresh token only in secure storage', async () => {
    const { session, values, writes, requests, statuses } = make({
      '/api/v1/auth/login': [
        { status: 200, body: { mfaRequired: false, ...tokens(1).body, deviceToken: 'device-1' } },
      ],
    });
    expect(await session.signIn('noa@demo.test', 'a long password')).toBeNull();
    expect(requests[0]!.body).toEqual({
      email: 'noa@demo.test',
      password: 'a long password',
      client: 'app',
      deviceName: 'Pixel 9',
    });
    expect(requests[0]!.headers['Accept-Language']).toBe('he');
    expect(session.status).toBe('signedIn');
    expect(statuses).toEqual(['signedIn']);
    expect(session.accessToken()).toBe('access-1');
    // The refresh token and the device token are in secure storage; the access token and the
    // password are written nowhere.
    expect(Object.fromEntries(values)).toEqual({
      [REFRESH_KEY]: 'refresh-1',
      [DEVICE_KEY]: 'device-1',
    });
    expect(JSON.stringify(writes)).not.toContain('access-1');
    expect(JSON.stringify(writes)).not.toContain('a long password');
  });

  it('sends the phone’s device token on a later sign-in', async () => {
    const { session, requests } = make(
      { '/api/v1/auth/login': [{ status: 200, body: { mfaRequired: false, ...tokens(1).body } }] },
      { [DEVICE_KEY]: 'device-1' },
    );
    await session.signIn('noa@demo.test', 'a long password');
    expect(requests[0]!.body.deviceToken).toBe('device-1');
  });

  it('asks for the authenticator code when the account has one', async () => {
    const { session, values, requests } = make({
      '/api/v1/auth/login': [
        { status: 200, body: { mfaRequired: true, mfaToken: 'challenge', mfaMethods: ['totp'] } },
      ],
      '/api/v1/auth/mfa/verify': [refused(401, 'MFA_INVALID_CODE'), tokens(2)],
    });
    expect(await session.signIn('dana@demo.test', 'a long password')).toEqual({
      mfaToken: 'challenge',
    });
    // Not signed in yet, and nothing stored.
    expect(session.status).toBe('loading');
    expect(values.has(REFRESH_KEY)).toBe(false);

    await expect(session.verifyCode('challenge', '000000')).rejects.toMatchObject({
      code: 'MFA_INVALID_CODE',
    });
    expect(values.has(REFRESH_KEY)).toBe(false);
    await session.verifyCode('challenge', '123456');
    expect(requests.at(-1)!.body).toEqual({
      mfaToken: 'challenge',
      code: '123456',
      client: 'app',
      deviceName: 'Pixel 9',
    });
    expect(session.status).toBe('signedIn');
    expect(values.get(REFRESH_KEY)).toBe('refresh-2');
  });

  it('throws what the server said about a wrong password, and stores nothing', async () => {
    const { session, values } = make({
      '/api/v1/auth/login': [refused(401, 'INVALID_CREDENTIALS')],
    });
    const error = await session.signIn('noa@demo.test', 'wrong').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).messageKey).toBe('errors.INVALID_CREDENTIALS');
    expect(values.size).toBe(0);
    expect(session.accessToken()).toBeUndefined();
  });

  it('restores a stored session when the app opens, and replaces the token', async () => {
    const { session, values, requests } = make(
      { '/api/v1/auth/app/refresh': [tokens(2)] },
      { [REFRESH_KEY]: 'refresh-1' },
    );
    expect(await session.restore()).toBe('signedIn');
    expect(requests[0]!.body).toEqual({ refreshToken: 'refresh-1' });
    expect(values.get(REFRESH_KEY)).toBe('refresh-2');
    expect(session.accessToken()).toBe('access-2');
  });

  it('is signed out when nothing is stored, without asking the server', async () => {
    const { session, requests } = make({});
    expect(await session.restore()).toBe('signedOut');
    expect(requests).toEqual([]);
  });

  it('forgets a session the server no longer accepts', async () => {
    const { session, values } = make(
      { '/api/v1/auth/app/refresh': [refused(401, 'UNAUTHENTICATED')] },
      { [REFRESH_KEY]: 'ended-elsewhere' },
    );
    expect(await session.restore()).toBe('signedOut');
    expect(values.has(REFRESH_KEY)).toBe(false);
  });

  it('keeps the session when the server can’t be reached, and tries again later', async () => {
    const { session, values } = make(
      {
        '/api/v1/auth/app/refresh': [
          new TypeError('Network request failed'),
          refused(503, 'INTERNAL_ERROR'),
          refused(429, 'RATE_LIMITED'),
          tokens(2),
        ],
      },
      { [REFRESH_KEY]: 'refresh-1' },
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await session.restore()).toBe('unreachable');
      expect(values.get(REFRESH_KEY)).toBe('refresh-1');
    }
    expect(await session.restore()).toBe('signedIn');
  });

  it('refreshes once when two requests find the access token run out together', async () => {
    const { session, requests } = make(
      {
        '/api/v1/auth/app/refresh': [tokens(1), tokens(2)],
        '/api/v1/me': [
          refused(401, 'UNAUTHENTICATED'),
          refused(401, 'UNAUTHENTICATED'),
          { status: 200, body: { id: 'me' } },
          { status: 200, body: { id: 'me' } },
        ],
      },
      { [REFRESH_KEY]: 'refresh-0' },
    );
    await session.restore();
    const [a, b] = await Promise.all([session.fetch('/api/v1/me'), session.fetch('/api/v1/me')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    // One refresh when the app opened, and one for both requests together, not two.
    expect(requests.filter((r) => r.path === '/api/v1/auth/app/refresh')).toHaveLength(2);
    const sent = requests
      .filter((r) => r.path === '/api/v1/me')
      .map((r) => r.headers.Authorization);
    expect(sent).toEqual([
      'Bearer access-1',
      'Bearer access-1',
      'Bearer access-2',
      'Bearer access-2',
    ]);
  });

  it('gives back the refusal when renewing doesn’t help', async () => {
    const { session } = make(
      {
        '/api/v1/auth/app/refresh': [tokens(1), refused(401, 'UNAUTHENTICATED')],
        '/api/v1/me': [refused(401, 'UNAUTHENTICATED')],
      },
      { [REFRESH_KEY]: 'refresh-0' },
    );
    await session.restore();
    expect((await session.fetch('/api/v1/me')).status).toBe(401);
    expect(session.status).toBe('signedOut');
  });

  it('signs out on the phone whatever the server says', async () => {
    for (const answer of [{ status: 204 }, new TypeError('Network request failed')]) {
      const { session, values, requests } = make(
        { '/api/v1/auth/app/refresh': [tokens(1)], '/api/v1/auth/app/logout': [answer] },
        { [REFRESH_KEY]: 'refresh-0', [DEVICE_KEY]: 'device-1' },
      );
      await session.restore();
      await session.signOut();
      expect(session.status).toBe('signedOut');
      expect(session.accessToken()).toBeUndefined();
      expect(values.has(REFRESH_KEY)).toBe(false);
      // The phone stays a known device.
      expect(values.get(DEVICE_KEY)).toBe('device-1');
      expect(requests.at(-1)).toMatchObject({
        path: '/api/v1/auth/app/logout',
        body: { refreshToken: 'refresh-1' },
      });
    }
  });
});
