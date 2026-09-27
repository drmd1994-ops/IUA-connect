import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, directionOf, getMessages, isLocale } from './index';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locales', () => {
  it('defaults to Hebrew', () => {
    expect(DEFAULT_LOCALE).toBe('he');
  });

  it('knows text direction', () => {
    expect(directionOf('he')).toBe('rtl');
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(directionOf('ru')).toBe('ltr');
  });

  it('validates locale values', () => {
    expect(isLocale('he')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('messages', () => {
  const reference = keyPaths(getMessages(DEFAULT_LOCALE)).sort();

  it.each(LOCALES)('%s has exactly the same keys as the default locale', (locale) => {
    expect(keyPaths(getMessages(locale)).sort()).toEqual(reference);
  });

  it.each(LOCALES)('%s has no empty strings', (locale) => {
    const flat = JSON.stringify(getMessages(locale));
    expect(flat).not.toContain('""');
  });
});
