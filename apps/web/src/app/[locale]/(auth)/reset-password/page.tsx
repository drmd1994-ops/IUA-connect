import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ResetPasswordForm } from '@/features/auth/reset-password-form';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.reset' });
  // The reset token is in the URL: never leak it through the Referer header.
  return { title: t('title'), referrer: 'no-referrer' };
}

export default async function ResetPasswordPage({ params, searchParams }: Props) {
  setRequestLocale((await params).locale);
  const { token } = await searchParams;
  return <ResetPasswordForm token={typeof token === 'string' ? token : null} />;
}
