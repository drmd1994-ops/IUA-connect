import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LiveSessionPage } from '@/features/events/live-session';

type Props = { params: Promise<{ locale: string; slug: string; sessionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'events.live' });
  return { title: t('title') };
}

/** A session's polls, questions and feedback (M32). */
export default async function Page({ params }: Props) {
  const { locale, slug, sessionId } = await params;
  setRequestLocale(locale);
  return <LiveSessionPage slug={decodeURIComponent(slug)} sessionId={sessionId} />;
}
