import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SecurityPage } from '@/features/auth/security/security-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.security' });
  return { title: t('title') };
}

export default async function AccountSecurityPage({ params }: Props) {
  setRequestLocale((await params).locale);
  return <SecurityPage />;
}
