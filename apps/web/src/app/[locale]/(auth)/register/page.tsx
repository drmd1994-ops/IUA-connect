import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/features/auth/register-form';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.nav' });
  return { title: t('register') };
}

export default async function RegisterPage({ params }: Props) {
  setRequestLocale((await params).locale);
  return <RegisterForm />;
}
