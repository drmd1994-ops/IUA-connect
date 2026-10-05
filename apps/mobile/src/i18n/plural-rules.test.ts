import { createTranslator } from 'use-intl';
import { describe, expect, it } from 'vitest';
import { installPluralRules, pluralCategory } from './plural-rules';

describe('the form of a word a number takes', () => {
  it('agrees with the engine’s own rule where there is one, in both languages', () => {
    for (const locale of ['en', 'he']) {
      for (const type of ['cardinal', 'ordinal'] as const) {
        const own = new Intl.PluralRules(locale, { type });
        for (const value of [0, 0.5, 1, 1.5, 2, 3, 5, 10, 11, 12, 13, 20, 21, 22, 23, 100, 101]) {
          expect(`${locale} ${type} ${value}: ${pluralCategory(locale, value, type)}`).toBe(
            `${locale} ${type} ${value}: ${own.select(value)}`,
          );
        }
      }
    }
  });

  it('is installed only where the engine has none', () => {
    const without: { PluralRules?: unknown } = {};
    installPluralRules(without);
    expect(typeof without.PluralRules).toBe('function');
    const existing = { PluralRules: Intl.PluralRules };
    installPluralRules(existing);
    expect(existing.PluralRules).toBe(Intl.PluralRules);
  });

  it('lets a text with a plural be written on an engine that had none', () => {
    const own = Intl.PluralRules;
    try {
      // As on the phone: no rule of the engine's own.
      (Intl as { PluralRules?: unknown }).PluralRules = undefined;
      installPluralRules();
      for (const [locale, one, many] of [
        ['en', '1 place left', '5 places left'],
        ['he', 'מקום 1', '5 מקומות'],
      ] as const) {
        const t = createTranslator({
          locale,
          messages: {
            left:
              locale === 'en'
                ? '{count, plural, one {# place left} other {# places left}}'
                : '{count, plural, one {מקום #} other {# מקומות}}',
          },
        });
        expect(t('left', { count: 1 })).toBe(one);
        expect(t('left', { count: 5 })).toBe(many);
      }
    } finally {
      (Intl as { PluralRules?: unknown }).PluralRules = own;
    }
  });
});
