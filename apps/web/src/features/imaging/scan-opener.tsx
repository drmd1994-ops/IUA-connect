'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { useViewerAddress } from './scans';

/**
 * Opens one scan in the viewer (M36): asks the API for a signed link to it (the access check is
 * there), then moves to the viewer with it. The person's session stays with the site; the viewer
 * gets only the link to this scan.
 */
export function ScanOpener({ id }: { id: string }) {
  return <RequireSignIn>{() => <Opening id={id} />}</RequireSignIn>;
}

function Opening({ id }: { id: string }) {
  const t = useTranslations('imaging.viewer');
  const { api, call } = useAuth();
  const address = useViewerAddress();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/imaging/scans/{id}/viewer', { params: { path: { id } } }))
      .then((link) => active && window.location.replace(address(link)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [api, call, id, address]);

  return (
    <PageFrame>
      <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
      {failed ? <Alert tone="error">{t('failed')}</Alert> : <p role="status">{t('opening')}</p>}
    </PageFrame>
  );
}
