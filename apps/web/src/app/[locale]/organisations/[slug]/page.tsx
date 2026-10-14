import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrganisationPage } from '@/features/organisations/organisation-page';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'organisations' });
  return { title: t('nav') };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <OrganisationPage slug={decodeURIComponent(slug)} />;
}
