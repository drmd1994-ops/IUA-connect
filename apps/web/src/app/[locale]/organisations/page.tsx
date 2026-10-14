import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrganisationsPage } from '@/features/organisations/organisations-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organisations.list' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OrganisationsPage />;
}
