import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MyOrganisation } from '@/features/organisations/my-organisation';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'membership.card' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyOrganisation inside="membership/card" />;
}
