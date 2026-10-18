import { CALCULATORS, type Calculator, type RawValues, evaluate } from '@medconnect/calculators';
import { LOCALES, getMessages } from '@medconnect/i18n';
import { describe, expect, it } from 'vitest';

/** The text at a dotted path of the calculators' messages, if there is one. */
function text(messages: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      messages,
    );
}

/** Values a person could type: every option, numbers spread over each field's range. */
function samples(calculator: Calculator, count: number): RawValues[] {
  let seed = 7;
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => {
    const raw: Record<string, string> = {};
    for (const field of calculator.fields) {
      if (field.type === 'choice') {
        raw[field.key] = field.options[Math.floor(next() * field.options.length)]!;
      } else {
        const chosen = field.unitFrom && raw[field.unitFrom.field];
        const range = (chosen && field.unitFrom?.ranges[chosen]) || field;
        const value = range.min + next() * (range.max - range.min);
        raw[field.key] = value.toFixed(range.decimals);
      }
    }
    return raw;
  });
}

describe.each(LOCALES)('the calculators’ texts in %s', (locale) => {
  const messages = getMessages(locale).calculators;
  const has = (path: string) => expect(text(messages, path), path).toEqual(expect.any(String));

  it.each(CALCULATORS.map((c) => [c.id, c] as const))('%s has every text it can show', (_, c) => {
    has(`items.${c.id}.name`);
    has(`items.${c.id}.summary`);
    for (const field of c.fields) {
      has(`items.${c.id}.fields.${field.key}.label`);
      if (field.type === 'choice') {
        for (const option of field.options) has(`options.${field.set}.${option}`);
      } else {
        has(`units.${field.unit}`);
        for (const unit of Object.keys(field.unitFrom?.ranges ?? {})) has(`units.${unit}`);
      }
    }
    for (const raw of samples(c, 300)) {
      const outcome = evaluate(c, raw);
      expect(outcome.ok, JSON.stringify(raw)).toBe(true);
      if (!outcome.ok) continue;
      const { result } = outcome;
      if (result.unit) has(`units.${result.unit}`);
      if (result.band) has(`items.${c.id}.bands.${result.band}`);
      for (const part of result.parts ?? []) {
        has(`items.${c.id}.parts.${part.key}`);
        if (part.unit) has(`units.${part.unit}`);
      }
      for (const note of result.notes ?? []) has(`items.${c.id}.notes.${note}`);
    }
  });
});
