import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.forgot' });
  return { title: t('title') };
}

export default async function ForgotPasswordPage({ params }: Props) {
  setRequestLocale((await params).locale);
  return <ForgotPasswordForm />;
}
