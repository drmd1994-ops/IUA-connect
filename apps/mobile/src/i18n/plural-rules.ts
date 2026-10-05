/**
 * The phone's JavaScript engine (Hermes) has no Intl.PluralRules, and the texts need it for
 * "1 message" against "5 messages". This is that rule for the app's two languages, Hebrew and
 * English, as the Unicode plural rules define them. Any other language is read as English.
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type RuleType = 'cardinal' | 'ordinal';

/** Which form of a word a number takes. */
export function pluralCategory(locale: string, value: number, type: RuleType): PluralCategory {
  const whole = Number.isInteger(value);
  const amount = Math.abs(value);
  const hebrew = /^(he|iw)\b/i.test(locale);
  if (type === 'ordinal') {
    if (hebrew || !whole) return 'other';
    const ten = amount % 10;
    const hundred = amount % 100;
    if (ten === 1 && hundred !== 11) return 'one';
    if (ten === 2 && hundred !== 12) return 'two';
    if (ten === 3 && hundred !== 13) return 'few';
    return 'other';
  }
  if (hebrew) {
    // One: 1, and a fraction below one ("0.5"). Two: 2. Everything else: other.
    if ((whole && amount === 1) || (!whole && amount < 1)) return 'one';
    if (whole && amount === 2) return 'two';
    return 'other';
  }
  return whole && amount === 1 ? 'one' : 'other';
}

class PluralRules {
  private readonly locale: string;
  private readonly type: RuleType;

  constructor(locales?: string | readonly string[], options?: { type?: RuleType }) {
    const first = typeof locales === 'string' ? locales : locales?.[0];
    this.locale = first ?? 'en';
    this.type = options?.type ?? 'cardinal';
  }

  static supportedLocalesOf(locales?: string | readonly string[]): string[] {
    if (!locales) return [];
    return typeof locales === 'string' ? [locales] : [...locales];
  }

  select(value: number): PluralCategory {
    return pluralCategory(this.locale, value, this.type);
  }

  resolvedOptions() {
    const hebrew = /^(he|iw)\b/i.test(this.locale);
    return {
      locale: this.locale,
      type: this.type,
      pluralCategories:
        this.type === 'ordinal'
          ? hebrew
            ? ['other']
            : ['one', 'two', 'few', 'other']
          : hebrew
            ? ['one', 'two', 'other']
            : ['one', 'other'],
    };
  }
}

/** Gives the engine the rule when it has none. A phone that has its own keeps its own. */
export function installPluralRules(target: { PluralRules?: unknown } = Intl): void {
  if (typeof target.PluralRules === 'function') return;
  target.PluralRules = PluralRules;
}
