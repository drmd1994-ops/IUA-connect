'use client';

import { useTranslations } from 'next-intl';

/**
 * "Medical student" or "Resident" beside a person's name (M17), so nobody takes them for a
 * specialist. Nothing for anyone else.
 */
export function PersonMark({ mark }: { mark: 'STUDENT' | 'RESIDENT' | null | undefined }) {
  const t = useTranslations('verification.marks');
  if (!mark) return null;
  return (
    <span
      className="ms-2 inline-block rounded-full border border-border px-2 py-0.5 align-middle text-xs font-semibold text-text-muted"
      data-testid="person-mark"
    >
      {t(mark)}
    </span>
  );
}
