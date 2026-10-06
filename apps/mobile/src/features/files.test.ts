import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({ API_URL: 'https://api.example.test' }));
vi.mock('@/session/session-provider', () => ({ useSession: () => ({}) }));

const { absoluteFileUrl, sizeParts } = await import('./files');

describe('a stored file', () => {
  it('is fetched from the server the app talks to', () => {
    const path = '/api/v1/files/abc/content?v=full&exp=1&sig=x';
    expect(absoluteFileUrl('https://api.example.test', path)).toBe(
      `https://api.example.test${path}`,
    );
    expect(absoluteFileUrl('https://api.example.test/', path)).toBe(
      `https://api.example.test${path}`,
    );
  });

  it('keeps an address that is already whole', () => {
    expect(absoluteFileUrl('https://api.example.test', 'https://files.example.test/a')).toBe(
      'https://files.example.test/a',
    );
  });

  it('has its size said in kilobytes or megabytes', () => {
    expect(sizeParts(300)).toEqual({ unit: 'kb', value: 1 });
    expect(sizeParts(250_000)).toEqual({ unit: 'kb', value: 244 });
    expect(sizeParts(1_048_576)).toEqual({ unit: 'mb', value: 1 });
    expect(sizeParts(3_300_000)).toEqual({ unit: 'mb', value: 3.1 });
  });
});
