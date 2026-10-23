'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useAuth } from '@/features/auth/auth-context';
import { PageFrame, RequireSignIn } from '@/features/auth/require-sign-in';
import { errorMessage } from '@/lib/api-errors';
import { CareersNav, PositionCard, type PositionSummary } from './careers-parts';

type List = components['schemas']['SavedPositionListDto'];

/** The reader's saved positions (M28). Theirs alone. */
export function SavedPositions() {
  return <RequireSignIn>{() => <Saved />}</RequireSignIn>;
}

function Saved() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/positions/saved'))
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  async function remove(item: PositionSummary) {
    setPending(item.id);
    setError(null);
    try {
      await call(() =>
        api.DELETE('/api/v1/positions/{id}/saved', { params: { path: { id: item.id } } }),
      );
      setList((current) => current && { items: current.items.filter((p) => p.id !== item.id) });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  }

  return (
    <PageFrame wide>
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('careers.saved.title')}</h1>
        <p className="mt-2 text-text-muted">{t('careers.saved.intro')}</p>
      </div>
      <CareersNav />
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!list && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {list && list.items.length === 0 && (
        <p className="text-text-muted">{t('careers.saved.empty')}</p>
      )}
      {list && list.items.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="saved-positions">
          {list.items.map((item) => (
            <li key={item.id}>
              <PositionCard
                item={item}
                pending={pending === item.id}
                onToggleSave={(it) => void remove(it)}
              />
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
