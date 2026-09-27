import { describe, expect, it } from 'vitest';
import { buildCsp, createNonce } from './csp';

describe('buildCsp', () => {
  const production = buildCsp('abc123', { dev: false, apiOrigin: 'https://api.example.test' });

  it('uses the nonce for scripts and never allows unsafe-eval in production', () => {
    expect(production).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    const scriptSrc = production.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('forbids framing and plugins', () => {
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("object-src 'none'");
  });

  it('allows the API origin for fetch', () => {
    expect(production).toContain("connect-src 'self' https://api.example.test");
  });

  it('relaxes only what development tooling needs', () => {
    const dev = buildCsp('abc123', { dev: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain('upgrade-insecure-requests');
  });
});

describe('createNonce', () => {
  it('is random and base64', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
