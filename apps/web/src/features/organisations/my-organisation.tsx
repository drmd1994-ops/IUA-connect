'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useRouter } from '@/i18n/navigation';
import { sectionHref, useMyMemberships, useOrganisations } from './organisations';

/**
 * The old addresses of "my membership" and "my card", from before a membership was in an
 * organisation's section. They lead to the same page in the person's organisation: the one they
 * are a member of, or the only one there is; otherwise to the list of organisations.
 */
export function MyOrganisation({ inside }: { inside: 'membership' | 'membership/card' }) {
  return <RequireSignIn>{() => <Leading inside={inside} />}</RequireSignIn>;
}

function Leading({ inside }: { inside: string }) {
  const t = useTranslations('organisations.mine');
  const router = useRouter();
  const memberships = useMyMemberships();
  const organisations = useOrganisations();

  useEffect(() => {
    if (!memberships || !organisations) return;
    const slug =
      memberships[0]?.organisation.slug ??
      (organisations.length === 1 ? organisations[0]?.slug : undefined);
    router.replace(slug ? sectionHref(slug, inside) : '/organisations');
  }, [memberships, organisations, inside, router]);

  return (
    <PageFrame>
      <p role="status">{t('looking')}</p>
    </PageFrame>
  );
}
