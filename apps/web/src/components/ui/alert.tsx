import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'error';

const tones: Record<Tone, string> = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  success: 'border-success-700/30 bg-success-100 text-success-700',
  warning: 'border-warning-700/30 bg-warning-100 text-warning-700',
  error: 'border-danger-700/30 bg-danger-100 text-danger-700',
};

/** Errors interrupt screen readers (role="alert"); everything else is announced politely. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
