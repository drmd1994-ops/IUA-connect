import { type CookieOptions, type Request, type Response } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { randomToken, safeEqual } from '../../infra/crypto/secrets';

/**
 * Browser cookies (ARCHITECTURE.md §9). The web app proxies /api/v1 to the API, so these are
 * first-party cookies of the web origin. `Secure` works on http://localhost in all browsers.
 */
export const REFRESH_COOKIE = 'iua_rt';
export const CSRF_COOKIE = 'iua_csrf';
export const DEVICE_COOKIE = 'iua_did';
export const CSRF_HEADER = 'x-csrf-token';

const AUTH_PATH = '/api/v1/auth';
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 3600 * 1000;

const base: CookieOptions = { secure: true, sameSite: 'strict' };

/** Refresh token (HttpOnly, auth path only) plus a fresh CSRF token readable by the web app. */
export function setSessionCookies(
  res: Response,
  refreshToken: string,
  sessionExpiresAt: Date,
): void {
  const maxAge = Math.max(0, sessionExpiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, httpOnly: true, path: AUTH_PATH, maxAge });
  res.cookie(CSRF_COOKIE, randomToken(), { ...base, httpOnly: false, path: '/', maxAge });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true, path: AUTH_PATH });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: '/' });
}

export function setDeviceCookie(res: Response, token: string): void {
  res.cookie(DEVICE_COOKIE, token, {
    ...base,
    httpOnly: true,
    path: AUTH_PATH,
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Double-submit check for cookie-authenticated endpoints (refresh, logout). */
export function assertCsrf(req: Request): void {
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers[CSRF_HEADER];
  if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
    throw new AppException('CSRF_INVALID');
  }
}
