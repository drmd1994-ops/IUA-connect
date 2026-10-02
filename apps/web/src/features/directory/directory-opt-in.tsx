'use client';

import type { components } from '@iua/api-client';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Consents = components['schemas']['ConsentsDto'];

/**
 * On "My profile": joining and leaving the member directory. Joining is a consent, so the
 * section says what becomes visible, and to whom, before the button.
 */
export function DirectoryOptIn() {
  const t = useTranslations();
  const o = (key: string, values?: Record<string, string>) => t(`directory.optIn.${key}`, values);
  const format = useFormatter();
  const { api, call } = useAuth();
  const [consents, setConsents] = useState<Consents | null>(null);
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState<'joined' | 'left' | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/me/consents'))
      .then((result) => active && setConsents(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function set(granted: boolean) {
    setPending(true);
    setChanged(null);
    setError(null);
    try {
      setConsents(
        await call(() => api.POST('/api/v1/me/consents', { body: { kind: 'DIRECTORY', granted } })),
      );
      setChanged(granted ? 'joined' : 'left');
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const directory = consents?.directory;
  return (
    <section
      aria-labelledby="directory-opt-in-title"
      className="flex flex-col gap-3 rounded-md border border-border p-5"
      data-testid="directory-opt-in"
    >
      <h2 id="directory-opt-in-title" className="text-xl font-semibold">
        {o('title')}
      </h2>
      <p className="text-text-muted">{o('explain')}</p>
      {directory && (
        <p className="font-semibold" data-testid="directory-state">
          {directory.granted && directory.grantedAt
            ? o('on', {
                date: format.dateTime(new Date(directory.grantedAt), { dateStyle: 'long' }),
              })
            : o('off')}
        </p>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {changed && <Alert tone="success">{o(changed)}</Alert>}
      {directory && (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            variant={directory.granted ? 'secondary' : 'primary'}
            pending={pending}
            onClick={() => void set(!directory.granted)}
          >
            {o(directory.granted ? 'leave' : 'join')}
          </Button>
          <Link href="/members" className="font-semibold text-primary underline underline-offset-4">
            {o('view')}
          </Link>
        </div>
      )}
    </section>
  );
}
