import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { VerifyCard } from '@/features/membership/verify-card';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'membership.verify' });
  return { title: t('title') };
}

/** Public: opened by scanning a membership card's QR code. */
export default async function VerifyCardPage({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const { t } = await searchParams;
  return <VerifyCard token={typeof t === 'string' && t ? t : null} />;
}
