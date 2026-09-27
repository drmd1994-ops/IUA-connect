import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/features/auth/login-form';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.nav' });
  return { title: t('signIn') };
}

export default async function LoginPage({ params }: Props) {
  setRequestLocale((await params).locale);
  return <LoginForm />;
}
