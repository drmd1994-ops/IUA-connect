import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { VerifyEmail } from '@/features/auth/verify-email';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.verify' });
  return { title: t('title'), referrer: 'no-referrer' };
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === 'string' ? token : null} />;
}
