import { describe, expect, it } from 'vitest';
import { startingLocale } from './locale';

describe('the language the app starts in', () => {
  it('follows the phone when it is Hebrew or English', () => {
    expect(startingLocale(['en'])).toBe('en');
    expect(startingLocale(['he'])).toBe('he');
    // The old code some Android phones still report for Hebrew.
    expect(startingLocale(['iw'])).toBe('he');
  });

  it('takes the first language the app has, and otherwise Hebrew', () => {
    expect(startingLocale(['ru', 'en', 'he'])).toBe('en');
    expect(startingLocale(['ar', 'fr'])).toBe('he');
    expect(startingLocale([])).toBe('he');
    expect(startingLocale([null, undefined])).toBe('he');
  });
});
