'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Message = components['schemas']['BroadcastMessageDto'];

const link = 'font-semibold text-primary underline underline-offset-4';

/** A message from an organisation or from the platform, as one of its recipients reads it. */
export function BroadcastMessage({ id }: { id: string }) {
  return <RequireSignIn>{() => <MessageView id={id} />}</RequireSignIn>;
}

function MessageView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const { api, call } = useAuth();
  const [message, setMessage] = useState<Message | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/broadcasts/{id}', { params: { path: { id }, query: { locale } } }))
      .then((result) => active && setMessage(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, id, locale]);

  return (
    <PageFrame>
      <Link href="/account/notifications" className={link}>
        {t('notifications.message.back')}
      </Link>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!message && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {message && (
        <article data-testid="broadcast-message">
          <p className="text-sm text-text-muted">
            {t('organisations.owner.from', {
              name: message.organisation
                ? locale === 'he'
                  ? message.organisation.nameHe
                  : message.organisation.nameEn
                : t('common.app.name'),
            })}
            {' · '}
            {t('notifications.message.sentAt', {
              when: format.dateTime(new Date(message.sentAt), {
                dateStyle: 'long',
                timeStyle: 'short',
              }),
            })}
          </p>
          <div lang={message.locale} dir={message.locale === 'he' ? 'rtl' : 'ltr'}>
            <h1 className="mt-2 text-3xl font-semibold text-brand-900">{message.title}</h1>
            <div className="mt-4 flex flex-col gap-4 leading-relaxed">
              {message.paragraphs.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </article>
      )}
    </PageFrame>
  );
}
