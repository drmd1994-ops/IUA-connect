'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { sectionHref, useOrganisations } from './organisations';

/**
 * The header's way into the organisations' sections. While the platform has one organisation
 * the link opens its section directly; with more it opens the list.
 */
export function OrganisationsLink() {
  const t = useTranslations('organisations');
  const organisations = useOrganisations();
  const only = organisations?.length === 1 ? organisations[0] : undefined;
  return (
    <Link
      href={only ? sectionHref(only.slug) : '/organisations'}
      data-testid="organisations-link"
      className="rounded-md px-2 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted"
    >
      {t('nav')}
    </Link>
  );
}
