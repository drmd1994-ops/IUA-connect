'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage } from '@/features/content/files';
import { errorMessage } from '@/lib/api-errors';

/**
 * The member's own photo (M3 plan §4). Only the member sees it for now; who else may see it is
 * set with the "Profile photo" visibility below, used once the member directory exists.
 */
export function PhotoSection({ initialFileId }: { initialFileId: string | null }) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const inputId = useId();
  const [fileId, setFileId] = useState(initialFileId);
  const [chosen, setChosen] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'removed' | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function attempt(work: () => Promise<void>) {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!chosen) return;
    void attempt(async () => {
      const result = await call(() =>
        api.PUT('/api/v1/me/profile/photo', {
          body: { file: '' },
          bodySerializer: () => {
            const data = new FormData();
            data.append('file', chosen);
            return data;
          },
        }),
      );
      setFileId(result.photo.id);
      setChosen(null);
      form.reset();
      setNotice('saved');
    });
  }

  const remove = () =>
    attempt(async () => {
      await call(() => api.DELETE('/api/v1/me/profile/photo'));
      setFileId(null);
      setNotice('removed');
    });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="photo-title">
      <div>
        <h2 id="photo-title" className="text-xl font-semibold">
          {t('content.photo.title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('content.photo.intro')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {fileId ? (
          <StoredImage
            key={fileId}
            fileId={fileId}
            variant="thumb"
            alt={t('content.photo.alt')}
            className="size-32 rounded-full border border-border object-cover"
          />
        ) : (
          <p className="text-text-muted">{t('content.photo.none')}</p>
        )}
        <form onSubmit={upload} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="font-semibold">
              {t('content.photo.choose')}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(event) => setChosen(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={pending} disabled={!chosen}>
              {t('content.photo.upload')}
            </Button>
            {fileId && (
              <Button type="button" variant="secondary" disabled={pending} onClick={remove}>
                {t('content.photo.remove')}
              </Button>
            )}
          </div>
        </form>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {notice && <Alert tone="success">{t(`content.photo.${notice}`)}</Alert>}
    </section>
  );
}
