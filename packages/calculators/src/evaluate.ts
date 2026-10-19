import type { Calculator, Field, FieldProblem, Outcome, RawValues, Values } from './types';

/**
 * A number as people type it: digits, one decimal point or comma, no sign. Empty: not given.
 * Not a number: `NaN`.
 */
export function parseNumber(raw: string | undefined): number | null {
  const text = raw?.trim().replace(',', '.') ?? '';
  if (text === '') return null;
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return Number.NaN;
  return Number(text);
}

function decimalsOf(raw: string): number {
  const text = raw.trim().replace(',', '.');
  const point = text.indexOf('.');
  return point < 0 ? 0 : text.length - point - 1;
}

/** Rounds as the value is shown, so what is read from it agrees with what is seen. */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

function check(field: Field, raw: RawValues): { value?: number | string; problem?: FieldProblem } {
  const given = raw[field.key];
  if (field.type === 'choice') {
    const value = given ?? field.initial;
    if (value === undefined || value === '')
      return { problem: { field: field.key, code: 'required' } };
    if (!field.options.includes(value)) return { problem: { field: field.key, code: 'required' } };
    return { value };
  }
  let { min, max, decimals, unit } = field;
  if (field.unitFrom) {
    const chosen = raw[field.unitFrom.field];
    const range = chosen === undefined ? undefined : field.unitFrom.ranges[chosen];
    if (range) ({ min, max, decimals } = range);
    if (range && chosen) unit = chosen;
  }
  const value = parseNumber(given);
  if (value === null) return { problem: { field: field.key, code: 'required' } };
  if (Number.isNaN(value) || decimalsOf(given ?? '') > decimals) {
    return { problem: { field: field.key, code: 'notNumber', decimals } };
  }
  if (value < min || value > max) {
    return { problem: { field: field.key, code: 'outOfRange', min, max, unit } };
  }
  return { value };
}

/**
 * Checks what was typed and, when every field is sound, calculates. A value outside the range a
 * formula was made for is refused with that range, and no number is given (plan §3).
 */
export function evaluate(calculator: Calculator, raw: RawValues): Outcome {
  const values: Record<string, number | string> = {};
  const problems: FieldProblem[] = [];
  for (const field of calculator.fields) {
    const checked = check(field, field.type === 'choice' ? raw : withUnit(field, raw, calculator));
    if (checked.problem) problems.push(checked.problem);
    else if (checked.value !== undefined) values[field.key] = checked.value;
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, result: calculator.compute(values as Values) };
}

/** A unit chosen in another field counts even when it is still that field's first choice. */
function withUnit(field: Field, raw: RawValues, calculator: Calculator): RawValues {
  if (field.type !== 'number' || !field.unitFrom) return raw;
  const source = field.unitFrom.field;
  if (raw[source] !== undefined) return raw;
  const unitField = calculator.fields.find((f) => f.key === source);
  const initial = unitField?.type === 'choice' ? unitField.initial : undefined;
  return initial === undefined ? raw : { ...raw, [source]: initial };
}

/** The value as a number, for `compute`, which is called only with checked values. */
export function num(values: Values, key: string): number {
  const value = values[key];
  if (typeof value !== 'number') throw new Error(`${key} is not a number`);
  return value;
}

/** The chosen option, for `compute`. */
export function choice(values: Values, key: string): string {
  const value = values[key];
  if (typeof value !== 'string') throw new Error(`${key} is not a choice`);
  return value;
}
