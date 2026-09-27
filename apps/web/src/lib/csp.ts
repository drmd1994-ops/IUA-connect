/**
 * Content-Security-Policy with a per-request nonce (SECURITY_MODEL.md §3).
 * Development adds 'unsafe-eval' because React's dev tooling needs it; production does not.
 */
export function buildCsp(nonce: string, { dev, apiOrigin }: { dev: boolean; apiOrigin?: string }) {
  const connect = ["'self'", ...(apiOrigin ? [apiOrigin] : []), ...(dev ? ['ws:'] : [])];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Inline style attributes (used by React and UI primitives) cannot carry a nonce. Style
    // injection is far less dangerous than script injection, which stays nonce-only.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': connect,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
  return dev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
