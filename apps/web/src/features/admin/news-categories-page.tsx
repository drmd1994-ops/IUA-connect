'use client';

import type { components } from '@medconnect/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Category = components['schemas']['NewsCategoryListDto']['items'][number];

/** News categories: added and hidden by reviewers; never deleted. */
export function NewsCategoriesPage() {
  const t = useTranslations();
  const name = useLocalName();
  const { api, call } = useAuth();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [key, setKey] = useState('');
  const [nameHe, setNameHe] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const c = (k: string) => t(`content.adminNews.categories.${k}`);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/news/categories'))
      .then((result) => active && setCategories(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  async function attempt(request: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await request();
      setVersion((v) => v + 1);
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setPending(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const ok = await attempt(() =>
      call(() =>
        api.POST('/api/v1/admin/news/categories', { body: { key, nameHe, nameEn, sortOrder: 0 } }),
      ),
    );
    if (ok) {
      setKey('');
      setNameHe('');
      setNameEn('');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/news"
          className="font-semibold text-primary underline underline-offset-4"
        >
          {c('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{c('title')}</h1>
        <p className="mt-2 text-text-muted">{c('intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!categories && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {categories && (
        <ul className="flex flex-col gap-2" data-testid="news-categories">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4"
            >
              <span>
                <span className="font-semibold">{name(category)}</span>
                <span className="text-text-muted" dir="ltr">
                  {' · '}
                  {category.key}
                </span>
                {!category.active && (
                  <span className="ms-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs">
                    {c('inactive')}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                aria-label={`${category.active ? c('hide') : c('show')}: ${name(category)}`}
                onClick={() =>
                  void attempt(() =>
                    call(() =>
                      api.PATCH('/api/v1/admin/news/categories/{id}', {
                        params: { path: { id: category.id } },
                        body: { active: !category.active },
                      }),
                    ),
                  )
                }
              >
                {category.active ? c('hide') : c('show')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={add}
        noValidate
        className="grid gap-4 rounded-md border border-border p-5 sm:grid-cols-3 sm:items-end"
      >
        <TextField
          label={c('key')}
          hint={c('keyHint')}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          dir="ltr"
          maxLength={64}
          className="sm:col-span-3"
        />
        <TextField
          label={c('nameHe')}
          value={nameHe}
          onChange={(event) => setNameHe(event.target.value)}
          dir="rtl"
          maxLength={200}
        />
        <TextField
          label={c('nameEn')}
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          dir="ltr"
          maxLength={200}
        />
        <div>
          <Button type="submit" pending={pending} disabled={!key || !nameHe || !nameEn}>
            {c('add')}
          </Button>
        </div>
      </form>
    </div>
  );
}
