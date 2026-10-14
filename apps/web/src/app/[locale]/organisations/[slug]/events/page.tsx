import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrganisationEvents } from '@/features/organisations/organisation-lists';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.list' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <OrganisationEvents slug={decodeURIComponent(slug)} />;
}
