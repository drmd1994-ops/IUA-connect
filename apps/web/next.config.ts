import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Static security headers. The Content-Security-Policy (nonce-based) is set per request in
// src/proxy.ts, because the nonce changes on every response.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

// The proxy doesn't run for addresses with a file extension (/robots.txt, a mistyped /x.png),
// so the "not found" page served there would carry no policy at all. This fixed one has no
// nonce: nothing on that page needs to run.
const filePathCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The scan viewer (M36): OHIF, a separate single-page app built into public/viewer
 * (apps/viewer). It decodes images in workers with WebAssembly and styles itself inline; it reads
 * only from this origin (its scan links are under /api/v1). Nothing it loads comes from elsewhere.
 */
const viewerCsp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The browser only talks to this origin: /api/v1 is proxied to the API server, so the refresh
 * and CSRF cookies are first-party and CORS stays closed (docs/plans/M1-identity.md §3).
 */
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Next.js holds a request's body in memory for the proxy (src/proxy.ts), 10 MB by default,
    // and cuts a larger one off: a scan (M36) is up to 200 MB, a chat video up to 100 MB.
    proxyClientMaxBodySize: '210mb',
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/:path((?!api/|_next/|_vercel/|viewer/).*\\..*)',
        headers: [{ key: 'Content-Security-Policy', value: filePathCsp }],
      },
      { source: '/viewer/:path*', headers: [{ key: 'Content-Security-Policy', value: viewerCsp }] },
    ];
  },
  async rewrites() {
    // After the public files (so the viewer's own files are served as they are) and before the
    // site's pages: the viewer's addresses (/viewer/viewer/…) are its one page.
    return [
      { source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` },
      { source: '/viewer/:path*', destination: '/viewer/index.html' },
    ];
  },
};

export default withNextIntl(nextConfig);
