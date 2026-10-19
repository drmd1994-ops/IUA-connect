'use client';

import {
  type Calculator,
  type ChoiceField,
  type FieldProblem,
  type NumberField,
  type Result,
  calculatorById,
  evaluate,
} from '@medconnect/calculators';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Link } from '@/i18n/navigation';
import { CalculatorSource } from './calculator-source';

/**
 * One calculator, drawn from its definition (M30 plan §4). What is typed stays in this page's
 * memory: nothing is sent, stored or put in the address (plan §3).
 */
export function CalculatorForm({ id }: { id: string }) {
  const calculator = calculatorById(id);
  if (!calculator) return null;
  return <Form calculator={calculator} />;
}

function Form({ calculator }: { calculator: Calculator }) {
  const t = useTranslations('calculators');
  const format = useFormatter();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const item = (key: string, values?: Record<string, string | number>) =>
    t(`items.${calculator.id}.${key}`, values);
  const number = (value: number, decimals: number) =>
    format.number(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const change = (key: string, value: string) => {
    setRaw((current) => ({ ...current, [key]: value }));
    setResult(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const outcome = evaluate(calculator, raw);
    if (outcome.ok) {
      setProblems([]);
      setResult(outcome.result);
    } else {
      setProblems(outcome.problems);
      setResult(null);
    }
  };

  const clear = () => {
    setRaw({});
    setProblems([]);
    setResult(null);
  };

  const problemText = (problem: FieldProblem) => {
    switch (problem.code) {
      case 'required':
        return t('form.errors.required');
      case 'notNumber':
        return t('form.errors.notNumber', { decimals: problem.decimals });
      case 'outOfRange': {
        const decimals = Math.max(decimalsIn(problem.min), decimalsIn(problem.max));
        return t('form.errors.outOfRange', {
          min: number(problem.min, decimals),
          max: number(problem.max, decimals),
          unit: t(`units.${problem.unit}`),
        });
      }
    }
  };
  const errorsOf = (key: string) =>
    problems.filter((problem) => problem.field === key).map(problemText);

  /** The unit a number is typed in: its own, or the one chosen in another field. */
  const unitOf = (field: NumberField) => {
    if (!field.unitFrom) return field.unit;
    const source = calculator.fields.find((f) => f.key === field.unitFrom?.field);
    const chosen = raw[field.unitFrom.field] ?? (source?.type === 'choice' ? source.initial : '');
    return chosen && field.unitFrom.ranges[chosen] ? chosen : field.unit;
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {problems.length > 0 && <Alert tone="error">{t('form.fix')}</Alert>}
        {calculator.fields.map((field) => {
          const hint = t.has(`items.${calculator.id}.fields.${field.key}.hint`)
            ? item(`fields.${field.key}.hint`)
            : undefined;
          const label = item(`fields.${field.key}.label`);
          if (field.type === 'choice') {
            return (
              <ChoiceGroup
                key={field.key}
                field={field}
                label={label}
                hint={hint}
                value={raw[field.key] ?? field.initial ?? ''}
                errors={errorsOf(field.key)}
                optionLabel={(option) => t(`options.${field.set}.${option}`)}
                onChange={(value) => change(field.key, value)}
              />
            );
          }
          return (
            <TextField
              key={field.key}
              name={field.key}
              label={`${label} (${t(`units.${unitOf(field)}`)})`}
              hint={hint}
              inputMode="decimal"
              autoComplete="off"
              className="max-w-xs"
              value={raw[field.key] ?? ''}
              errors={errorsOf(field.key)}
              onChange={(event) => change(field.key, event.target.value)}
            />
          );
        })}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit">{t('form.calculate')}</Button>
          <Button type="button" variant="secondary" onClick={clear}>
            {t('form.clear')}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="calculator-result"
        aria-live="polite"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5"
      >
        <h2 id="calculator-result" className="text-xl font-semibold">
          {t('form.result')}
        </h2>
        {result && (
          <div data-testid="calculator-result" className="flex flex-col gap-3">
            <p className="text-3xl font-semibold text-brand-900">
              <span dir="ltr">{result.label ?? number(result.value, result.decimals)}</span>
              {result.unit && (
                <span className="ms-2 text-lg font-normal text-text-muted">
                  {t(`units.${result.unit}`)}
                </span>
              )}
            </p>
            {result.band && <p className="text-lg">{item(`bands.${result.band}`)}</p>}
            {result.parts && result.parts.length > 0 && (
              <div>
                <h3 className="font-semibold">{t('form.parts')}</h3>
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                  {result.parts.map((part) => (
                    <div key={part.key} className="contents">
                      <dt>{item(`parts.${part.key}`)}</dt>
                      <dd dir="ltr" className="text-end font-semibold">
                        {typeof part.value === 'number'
                          ? number(part.value, part.decimals ?? 0)
                          : part.value}
                        {part.unit ? ` ${t(`units.${part.unit}`)}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {result.notes?.map((note) => (
              <p key={note} className="text-sm text-text-muted">
                {item(`notes.${note}`)}
              </p>
            ))}
          </div>
        )}
        {/* The disclaimer is always beside the result (plan §3). */}
        <p className="text-sm font-semibold">{t('about.disclaimer')}</p>
      </section>

      <CalculatorSource calculator={calculator} />
      <Link
        href="/calculators"
        className="self-start font-semibold text-primary underline underline-offset-4"
      >
        {t('form.back')}
      </Link>
    </div>
  );
}

function decimalsIn(value: number): number {
  const text = String(value);
  const point = text.indexOf('.');
  return point < 0 ? 0 : text.length - point - 1;
}

function ChoiceGroup({
  field,
  label,
  hint,
  value,
  errors,
  optionLabel,
  onChange,
}: {
  field: ChoiceField;
  label: string;
  hint?: string;
  value: string;
  errors: string[];
  optionLabel: (option: string) => string;
  onChange: (value: string) => void;
}) {
  const hintId = hint ? `${field.key}-hint` : undefined;
  const errorId = errors.length ? `${field.key}-error` : undefined;
  // A few short answers sit in a row; a questionnaire's scale reads better one under another.
  const inRow = field.options.length <= 3;
  return (
    <fieldset
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      aria-invalid={errors.length ? true : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      <legend className="mb-1 font-semibold text-text">{label}</legend>
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      <div className={inRow ? 'flex flex-wrap gap-x-6 gap-y-2' : 'flex flex-col gap-2'}>
        {field.options.map((option) => (
          <label key={option} className="flex items-start gap-2">
            <input
              type="radio"
              name={field.key}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="mt-1 size-4 shrink-0"
            />
            <span>{optionLabel(option)}</span>
          </label>
        ))}
      </div>
      {errors.length > 0 && (
        <ul id={errorId} className="text-sm text-danger-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
