'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Previous / next paging for lists. Hidden when everything fits on one page. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('content.common');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const label = t('page', { page, pages });
  return (
    <nav className="flex items-center gap-3" aria-label={label}>
      <Button
        type="button"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t('previous')}
      </Button>
      <span className="text-sm">{label}</span>
      <Button
        type="button"
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('next')}
      </Button>
    </nav>
  );
}
