import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuditLogPage } from '@/features/admin/audit-log';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'portal.admin.audit' });
  return { title: t('title') };
}

const FILTERS = ['action', 'actor', 'entityType', 'entityId', 'from', 'to'] as const;

export default async function Page({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const query = await searchParams;
  // Filters may come with the address, for links such as "this account in the audit log".
  const initial = Object.fromEntries(
    FILTERS.flatMap((key) => {
      const value = query[key];
      return typeof value === 'string' ? [[key, value.slice(0, 254)]] : [];
    }),
  );
  return <AuditLogPage initial={initial} />;
}
