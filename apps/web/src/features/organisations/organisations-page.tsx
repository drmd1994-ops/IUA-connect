'use client';

import { useTranslations } from 'next-intl';
import { PageFrame } from '@/features/auth/require-sign-in';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { sectionHref, useDescription, useOrganisations } from './organisations';

/** Every organisation that has a section. Open to everyone. */
export function OrganisationsPage() {
  const t = useTranslations();
  const name = useLocalName();
  const description = useDescription();
  const organisations = useOrganisations();

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('organisations.list.title')}</h1>
        <p className="mt-2 text-text-muted">{t('organisations.list.intro')}</p>
      </div>
      {!organisations && <p role="status">{t('membership.common.loading')}</p>}
      {organisations?.length === 0 && (
        <p className="text-text-muted">{t('organisations.list.empty')}</p>
      )}
      {organisations && organisations.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2" data-testid="organisation-list">
          {organisations.map((organisation) => (
            <li key={organisation.id}>
              <article className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-6 shadow-card">
                <h2 className="text-lg font-semibold">
                  <Link
                    href={sectionHref(organisation.slug)}
                    aria-label={t('organisations.list.open', { name: name(organisation) })}
                    className="text-primary underline underline-offset-4"
                  >
                    {name(organisation)}
                  </Link>
                </h2>
                {description(organisation) && (
                  <p className="line-clamp-3 text-text-muted">{description(organisation)}</p>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
