import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EventPage } from '@/features/events/event-page';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.list' });
  return { title: t('title') };
}

/** The event is loaded in the browser, so members-only events can use the reader's session. */
export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <EventPage slug={decodeURIComponent(slug)} />;
}
