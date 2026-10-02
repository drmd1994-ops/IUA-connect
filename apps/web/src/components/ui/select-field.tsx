import { type SelectHTMLAttributes, useId } from 'react';

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  /** Shown first with an empty value (e.g. "Choose a hospital"). */
  placeholder?: string;
};

/** Labelled select, styled like TextField. */
export function SelectField({
  label,
  hint,
  options,
  placeholder,
  id,
  className = '',
  ...rest
}: Props) {
  const generated = useId();
  const selectId = id ?? generated;
  const hintId = hint ? `${selectId}-hint` : undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={selectId} className="font-semibold text-text">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      <select
        {...rest}
        id={selectId}
        aria-describedby={hintId}
        className="min-w-0 rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-base text-text"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
