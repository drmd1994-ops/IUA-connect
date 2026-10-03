import { type TextareaHTMLAttributes, useId } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string };

/** Labelled multi-line text, styled like TextField. */
export function TextareaField({ label, hint, id, className = '', rows = 4, ...rest }: Props) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={fieldId} className="font-semibold text-text">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        aria-describedby={hintId}
        className="min-w-0 rounded-md border border-neutral-400 bg-surface px-3 py-2.5 text-base text-text"
      />
    </div>
  );
}
