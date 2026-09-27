import { type InputHTMLAttributes, useId } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  /** One or more error messages; the field is marked invalid when present. */
  errors?: string[];
};

/**
 * Labelled input with hint and errors wired to aria-describedby. Emails, passwords and codes are
 * forced left-to-right so they read correctly inside Hebrew pages.
 */
export function TextField({
  label,
  hint,
  errors = [],
  id,
  type = 'text',
  className = '',
  ...rest
}: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = errors.length ? `${inputId}-error` : undefined;
  const ltr = ['email', 'password', 'tel'].includes(type) || rest.inputMode === 'numeric';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="font-semibold text-text">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      <input
        {...rest}
        id={inputId}
        type={type}
        dir={ltr ? 'ltr' : undefined}
        aria-invalid={errors.length ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`rounded-md border bg-surface px-3 py-2.5 text-base text-text ${
          errors.length ? 'border-danger-700' : 'border-neutral-400'
        } ${ltr ? 'text-start' : ''}`}
      />
      {errors.length > 0 && (
        <ul id={errorId} className="text-sm text-danger-700">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
