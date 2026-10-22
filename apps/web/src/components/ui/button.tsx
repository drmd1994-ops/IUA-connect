'use client';

import { type ButtonHTMLAttributes, useSyncExternalStore } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'link';

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted disabled:opacity-60',
  danger: 'bg-danger-700 text-neutral-0 hover:opacity-90 disabled:opacity-60',
  link: 'px-0 py-0 text-primary underline underline-offset-4 hover:text-primary-hover',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Shows the pending label and blocks double submission. */
  pending?: boolean;
  pendingLabel?: string;
};

const noSubscribe = () => () => {};

/**
 * False in the page as sent and until it has loaded its scripts. Until then a form can't do its
 * work, and the browser's own submission would put what was typed in the address (a password,
 * a calculator's values): ZAP 10024, 10031.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

export function Button({
  variant = 'primary',
  pending = false,
  pendingLabel,
  className = '',
  children,
  disabled,
  ...rest
}: Props) {
  // A disabled submit button also stops the browser submitting the form when Enter is pressed.
  const hydrated = useHydrated();
  const early = rest.type === 'submit' && !hydrated;
  const padding = variant === 'link' ? '' : 'px-5 py-2.5';
  return (
    <button
      {...rest}
      disabled={disabled || pending || early}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center rounded-md font-semibold transition-colors ${padding} ${styles[variant]} ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
