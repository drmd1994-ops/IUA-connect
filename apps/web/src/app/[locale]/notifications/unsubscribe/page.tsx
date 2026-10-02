import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Unsubscribe } from '@/features/notifications/unsubscribe';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications.unsubscribe' });
  // The address carries a token: never send it on to other sites.
  return { title: t('title'), referrer: 'no-referrer' };
}

export default async function Page({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const { t: token } = await searchParams;
  return <Unsubscribe token={typeof token === 'string' ? token : null} />;
}
