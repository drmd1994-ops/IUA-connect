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

/**
 * The browser only talks to this origin: /api/v1 is proxied to the API server, so the refresh
 * and CSRF cookies are first-party and CORS stays closed (docs/plans/M1-identity.md §3).
 */
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default withNextIntl(nextConfig);
