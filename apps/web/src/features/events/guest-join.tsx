'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { unwrap, useAuth } from '@/features/auth/auth-context';
import { PageFrame } from '@/features/auth/require-sign-in';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

const link = 'font-semibold text-primary underline underline-offset-4';

/**
 * The page the conference QR opens (M32 plan §4): a phone comes in as a guest, with a number and
 * no details. Someone already signed in has no need for it and goes on with their own account.
 */
export function GuestJoin({ slug, code }: { slug: string; code: string | null }) {
  const t = useTranslations();
  const { api, status, completeSignIn } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const eventPath = `/events/${encodeURIComponent(slug)}`;

  async function enter() {
    if (!code) return;
    setPending(true);
    setError(null);
    try {
      const result = unwrap(
        await api.POST('/api/v1/events/{slug}/guest-entry', {
          params: { path: { slug } },
          body: { code },
        }),
      );
      await completeSignIn(result.accessToken);
      router.replace(eventPath);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('events.guest.title')}</h1>
      {!code && <Alert tone="warning">{t('events.guest.noCode')}</Alert>}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {status === 'signedIn' ? (
        <Link href={eventPath} className={link}>
          {t('events.guest.alreadySignedIn')}
        </Link>
      ) : (
        code && (
          <>
            <p>{t('events.guest.explain')}</p>
            <div>
              <Button onClick={() => void enter()} disabled={pending || status === 'loading'}>
                {t('events.guest.enter')}
              </Button>
            </div>
            <p className="text-sm text-text-muted">{t('events.guest.demoNotice')}</p>
          </>
        )
      )}
    </PageFrame>
  );
}
