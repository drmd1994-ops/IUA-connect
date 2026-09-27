import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-hebrew/400.css';
import '@fontsource/ibm-plex-sans-hebrew/600.css';
import '../globals.css';

import { directionOf, getMessages, isLocale } from '@iua/i18n';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/demo-banner';
import { AuthProvider } from '@/features/auth/auth-context';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { routing } from '@/i18n/routing';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: isLocale(locale) ? locale : routing.defaultLocale,
    namespace: 'common.app',
  });
  return {
    title: { default: `${t('name')} · ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('description'),
    robots: { index: false, follow: false }, // private pitch demo: keep out of search engines
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Reading request headers renders every page per request, which the nonce-based CSP requires
  // (a statically rendered page would carry a stale nonce and its scripts would be blocked).
  await headers();
  const t = await getTranslations('common.a11y');
  // The browser needs UI text only; email templates stay on the server.
  const { common, auth, errors } = getMessages(locale);

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow-raised"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider messages={{ common, auth, errors }}>
          <AuthProvider>
            <DemoBanner />
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
