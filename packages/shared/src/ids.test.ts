import { describe, expect, it } from 'vitest';
import { UUID_PATTERN, uuidv7 } from './ids';

describe('uuidv7', () => {
  it('produces a valid RFC 9562 version 7 UUID', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_PATTERN);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const now = Date.UTC(2026, 8, 27, 12, 0, 0);
    const id = uuidv7(now);
    const hex = id.replace(/-/g, '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(now);
  });

  it('sorts by creation time', () => {
    const earlier = uuidv7(1_000_000);
    const later = uuidv7(2_000_000);
    expect(earlier < later).toBe(true);
  });

  it('is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()));
    expect(ids.size).toBe(10_000);
  });
});
