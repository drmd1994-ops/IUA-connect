'use client';

import type { components } from '@medconnect/api-client';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Markdown } from '@/features/content/markdown';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { usePlaceLine } from './careers-parts';

type Position = components['schemas']['PositionDto'];
const link = 'font-semibold text-primary underline underline-offset-4';

/** One position (M28), with how to apply. Open to everyone; saving needs an account. */
export function PositionView({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'he' | 'en';
  const format = useFormatter();
  const name = useLocalName();
  const place = usePlaceLine();
  const { api, call, status } = useAuth();
  const [item, setItem] = useState<Position | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    let active = true;
    call(() => api.GET('/api/v1/positions/{id}', { params: { path: { id } } }))
      .then((result) => active && setItem(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, status, id]);

  async function toggleSave() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const params = { params: { path: { id: item.id } } };
      if (item.saved) await call(() => api.DELETE('/api/v1/positions/{id}/saved', params));
      else await call(() => api.PUT('/api/v1/positions/{id}/saved', params));
      setItem({ ...item, saved: !item.saved });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const p = (key: string) => t(`careers.positions.${key}`);
  const back = (
    <Link href="/positions" className={link}>
      {p('back')}
    </Link>
  );
  if (error !== null && !item) {
    return (
      <PageFrame>
        {back}
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? p('notFound') : errorMessage(error, t)}
        </Alert>
      </PageFrame>
    );
  }
  if (!item) {
    return (
      <PageFrame>
        <p role="status">{t('membership.common.loading')}</p>
      </PageFrame>
    );
  }
  // The reader's language when there is one, and the other otherwise.
  const textLang: 'he' | 'en' = item.translations[locale] ? locale : locale === 'he' ? 'en' : 'he';
  const text = item.translations[textLang]!;
  const date = format.dateTime(new Date(`${item.closesOn}T12:00:00Z`), { dateStyle: 'long' });

  return (
    <PageFrame>
      {back}
      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">{t(`careers.kinds.${item.kind}`)}</p>
          <h1 className="text-3xl font-semibold text-brand-900" lang={textLang}>
            {text.title}
          </h1>
          <p className="text-lg text-text">{place(item.place)}</p>
          <p className="text-text-muted">
            {t('careers.positions.for', { audience: t(`careers.audiences.${item.audience}`) })}
          </p>
          {item.subspecialties.length > 0 && (
            <p className="text-text-muted">
              {p('subspecialties')}: {item.subspecialties.map((s) => name(s)).join(', ')}
            </p>
          )}
          <p className="font-semibold" data-testid="position-dates">
            {item.closed
              ? t('careers.positions.closedOn', { date })
              : t('careers.positions.applyBy', { date })}
          </p>
          {item.organisation && (
            <p className="text-sm text-text-muted">
              {t('careers.positions.from', { name: name(item.organisation) })}
            </p>
          )}
        </header>
        {item.closed && <Alert tone="warning">{p('closed')}</Alert>}
        {status === 'signedIn' && (
          <div>
            <Button
              type="button"
              variant="secondary"
              pending={pending}
              aria-pressed={item.saved}
              onClick={() => void toggleSave()}
            >
              {item.saved ? p('unsave') : p('save')}
            </Button>
          </div>
        )}
        {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
        {text.body.trim() && (
          <section
            aria-labelledby="position-details"
            lang={textLang}
            dir={textLang === 'he' ? 'rtl' : 'ltr'}
          >
            <h2 id="position-details" className="text-xl font-semibold">
              {p('details')}
            </h2>
            <Markdown>{text.body}</Markdown>
          </section>
        )}
        {!item.closed && (
          <section
            aria-labelledby="position-apply"
            className="flex flex-col gap-2 rounded-md border border-border p-5"
          >
            <h2 id="position-apply" className="text-xl font-semibold">
              {p('howToApply')}
            </h2>
            {item.applyUrl && (
              <p>
                <a href={item.applyUrl} className={link} rel="noopener noreferrer" target="_blank">
                  {p('applyLink')}
                </a>
              </p>
            )}
            {item.applyEmail && (
              <p>
                <a href={`mailto:${item.applyEmail}`} className={link}>
                  {t('careers.positions.applyEmail', { email: item.applyEmail })}
                </a>
              </p>
            )}
            <p className="text-sm text-text-muted">{p('applyNote')}</p>
          </section>
        )}
      </article>
    </PageFrame>
  );
}
