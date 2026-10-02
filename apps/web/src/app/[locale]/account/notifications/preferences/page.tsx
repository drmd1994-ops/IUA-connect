import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NotificationPreferencesPage } from '@/features/notifications/preferences-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications.preferences' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  setRequestLocale((await params).locale);
  return <NotificationPreferencesPage />;
}
