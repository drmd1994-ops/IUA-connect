import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MentorSettings } from '@/features/careers/mentor-settings';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'careers.settings' });
  return { title: t('title') };
}

export default async function Page({ params }: Props) {
  const resolved = await params;
  setRequestLocale(resolved.locale);
  return <MentorSettings />;
}
