import createMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { buildCsp, createNonce } from './lib/csp';

const handleI18nRouting = createMiddleware(routing);

/**
 * Runs on every page request: locale routing (next-intl) plus a nonce-based CSP.
 * Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
 */
export default function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV !== 'production',
    ...(process.env.NEXT_PUBLIC_API_URL ? { apiOrigin: process.env.NEXT_PUBLIC_API_URL } : {}),
  });
  request.headers.set('x-nonce', nonce);
  request.headers.set('Content-Security-Policy', csp);

  const response = handleI18nRouting(request);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Everything except API routes, Next.js internals and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
