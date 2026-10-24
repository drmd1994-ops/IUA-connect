import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JournalClubAdminList } from '@/features/journal-club/journal-club-admin';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'journalClub.admin' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return <JournalClubAdminList />;
}
