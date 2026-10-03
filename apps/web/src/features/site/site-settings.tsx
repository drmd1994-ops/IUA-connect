'use client';

import type { components } from '@iua/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { unwrap, useAuth } from '@/features/auth/auth-context';

type Settings = components['schemas']['PublicSettingsDto'];

const SiteSettingsContext = createContext<Settings | null>(null);

/** Loads what every page shows from the settings (the contact details, the notice) once. */
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let active = true;
    void api
      .GET('/api/v1/settings/public')
      .then((result) => active && setSettings(unwrap(result)))
      // Without the settings the page simply shows neither; it is not worth an error message.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  return <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>;
}

/** The notice an administrator switched on, at the top of every page. */
export function SiteNotice() {
  const settings = useContext(SiteSettingsContext);
  const locale = useLocale();
  const notice = settings?.notice;
  if (!notice) return null;
  const english = locale === 'en' && notice.textEn;
  return (
    <div
      role="note"
      data-testid="site-notice"
      lang={english ? 'en' : 'he'}
      dir={english ? 'ltr' : 'rtl'}
      className="border-b border-brand-200 bg-brand-50 px-6 py-2 text-center text-sm font-semibold text-brand-900"
    >
      {english ? notice.textEn : notice.textHe}
    </div>
  );
}

/** The association's contact details in the footer. Fields that are not set are left out. */
export function FooterContact() {
  const t = useTranslations('portal.footer');
  const settings = useContext(SiteSettingsContext);
  const locale = useLocale();
  const contact = settings?.contact;
  if (!contact) return null;
  const address = (locale === 'he' ? contact.addressHe : contact.addressEn) || contact.addressHe;
  if (!contact.email && !contact.phone && !address) return null;
  return (
    <address className="mt-4 not-italic" data-testid="footer-contact">
      <p className="font-semibold text-text">{t('contact')}</p>
      <dl className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
        {contact.email && (
          <div className="contents">
            <dt>{t('email')}</dt>
            <dd>
              <a
                href={`mailto:${contact.email}`}
                className="underline underline-offset-4"
                dir="ltr"
              >
                {contact.email}
              </a>
            </dd>
          </div>
        )}
        {contact.phone && (
          <div className="contents">
            <dt>{t('phone')}</dt>
            <dd dir="ltr" className="text-start">
              {contact.phone}
            </dd>
          </div>
        )}
        {address && (
          <div className="contents">
            <dt>{t('address')}</dt>
            <dd>{address}</dd>
          </div>
        )}
      </dl>
    </address>
  );
}

/** On the accessibility statement: where to report a problem. */
export function StatementContact() {
  const t = useTranslations('portal');
  const settings = useContext(SiteSettingsContext);
  if (!settings) return null;
  const { email, phone } = settings.contact;
  if (!email && !phone) {
    return <p className="mt-2 text-text-muted">{t('accessibility.noContact')}</p>;
  }
  return (
    <ul className="mt-2 flex flex-col gap-1" data-testid="statement-contact">
      {email && (
        <li>
          {t('footer.email')}:{' '}
          <a
            href={`mailto:${email}`}
            className="font-semibold text-primary underline underline-offset-4"
            dir="ltr"
          >
            {email}
          </a>
        </li>
      )}
      {phone && (
        <li>
          {t('footer.phone')}: <span dir="ltr">{phone}</span>
        </li>
      )}
    </ul>
  );
}
