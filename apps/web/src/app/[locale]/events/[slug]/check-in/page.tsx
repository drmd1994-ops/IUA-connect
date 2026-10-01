import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckIn } from '@/features/events/check-in';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.checkIn' });
  return { title: t('title') };
}

/** Opened by scanning the QR code an event admin shows at the venue. */
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { t } = await searchParams;
  return <CheckIn slug={decodeURIComponent(slug)} token={typeof t === 'string' && t ? t : null} />;
}
