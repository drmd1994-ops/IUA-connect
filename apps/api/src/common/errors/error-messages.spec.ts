import { DEFAULT_LOCALE, LOCALES, getMessages } from '@medconnect/i18n';
import { ERROR_CODES, ERROR_DEFINITIONS } from '@medconnect/shared';

function lookup(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }, messages);
}

describe('error message keys', () => {
  it.each(LOCALES)('every API error code has a %s translation', (locale) => {
    const messages = getMessages(locale);
    const missing = ERROR_CODES.filter(
      (code) => typeof lookup(messages, ERROR_DEFINITIONS[code].message) !== 'string',
    );
    expect(missing).toEqual([]);
  });

  it('uses the default locale as the reference', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});
