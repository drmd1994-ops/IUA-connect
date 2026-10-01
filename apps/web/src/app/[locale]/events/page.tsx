import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EventList } from '@/features/events/event-list';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.list' });
  return { title: t('title'), description: t('intro') };
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  return <EventList />;
}
