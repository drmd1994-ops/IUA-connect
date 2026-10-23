'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';

type Community = components['schemas']['AdminCommunityDto'];

const EMPTY = {
  slug: '',
  nameHe: '',
  nameEn: '',
  descriptionHe: '',
  descriptionEn: '',
  sortOrder: '100',
};
const link = 'font-semibold text-primary underline underline-offset-4';

/** Communities for staff (M25): open, close, and appoint moderators. */
export function CommunitiesAdmin() {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [items, setItems] = useState<Community[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/communities'))
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, version]);

  const a = (key: string) => t(`communities.admin.${key}`);
  const reload = () => setVersion((v) => v + 1);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-brand-900">{a('title')}</h1>
          <p className="mt-2 text-text-muted">{a('intro')}</p>
          <p className="mt-1 text-sm text-text-muted">{a('roomsNote')}</p>
        </div>
        {!opening && <Button onClick={() => setOpening(true)}>{a('new')}</Button>}
      </div>
      {opening && (
        <CommunityForm
          onDone={(saved) => {
            setOpening(false);
            if (saved) reload();
          }}
        />
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {!items && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {items && (
        <ul className="flex flex-col gap-4" data-testid="admin-communities">
          {items.map((community) => (
            <li key={community.id}>
              <CommunityRow community={community} onChange={reload} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommunityRow({ community, onChange }: { community: Community; onChange: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const { api, call } = useAuth();
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notFound, setNotFound] = useState(false);
  const a = (key: string) => t(`communities.admin.${key}`);
  const path = { params: { path: { id: community.id } } };

  async function run(work: () => Promise<unknown>) {
    setError(null);
    setNotFound(false);
    try {
      await work();
      onChange();
    } catch (caught) {
      setError(caught);
    }
  }

  async function addModerator(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const found = await call(() =>
        api.GET('/api/v1/admin/users', { params: { query: { q: email.trim(), pageSize: 5 } } }),
      );
      const person = found.items.find(
        (item) => item.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!person) {
        setNotFound(true);
        throw new Error('notFound');
      }
      await call(() =>
        api.POST('/api/v1/admin/communities/{id}/moderators', {
          ...path,
          body: { userId: person.id },
        }),
      );
      setEmail('');
    }).catch(() => undefined);
  }

  const name = locale === 'he' ? community.nameHe : community.nameEn;
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {community.archived ? (
              name
            ) : (
              <Link href={`/communities/${community.slug}`} className={link}>
                {name}
              </Link>
            )}
          </h2>
          <p className="text-sm text-text-muted">
            /{community.slug} · {t('communities.admin.posts', { count: community.postCount })}
            {community.archived && ` · ${a('archived')}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setEditing((v) => !v)}>
            {t('communities.post.edit')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void run(() =>
                call(() =>
                  community.archived
                    ? api.POST('/api/v1/admin/communities/{id}/restore', path)
                    : api.POST('/api/v1/admin/communities/{id}/archive', path),
                ),
              )
            }
          >
            {community.archived ? a('restore') : a('archive')}
          </Button>
        </div>
      </div>
      {editing && (
        <CommunityForm
          community={community}
          onDone={(saved) => {
            setEditing(false);
            if (saved) onChange();
          }}
        />
      )}
      <div>
        <h3 className="font-semibold">{a('moderators')}</h3>
        {community.moderators.length === 0 ? (
          <p className="text-sm text-text-muted">{t('communities.community.noModerators')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {community.moderators.map((moderator) => {
              const who = `${moderator.firstName} ${moderator.lastName}`;
              return (
                <li key={moderator.id} className="flex flex-wrap items-center gap-3">
                  <span>{who}</span>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() =>
                      void run(() =>
                        call(() =>
                          api.DELETE('/api/v1/admin/communities/{id}/moderators/{userId}', {
                            params: { path: { id: community.id, userId: moderator.id } },
                          }),
                        ),
                      )
                    }
                  >
                    {t('communities.admin.removeModerator', { name: who })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form
        noValidate
        onSubmit={(event) => void addModerator(event)}
        className="flex flex-wrap items-end gap-3"
      >
        <TextField
          label={a('moderatorEmail')}
          hint={a('moderatorEmailHint')}
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!email.trim()}>
          {a('addModerator')}
        </Button>
      </form>
      {notFound && <Alert tone="error">{a('notFound')}</Alert>}
      {error !== null && !notFound && <Alert tone="error">{errorMessage(error, t)}</Alert>}
    </article>
  );
}

function CommunityForm({
  community,
  onDone,
}: {
  community?: Community;
  onDone: (saved: boolean) => void;
}) {
  const t = useTranslations();
  const { api, call } = useAuth();
  const [form, setForm] = useState(() =>
    community
      ? {
          slug: community.slug,
          nameHe: community.nameHe,
          nameEn: community.nameEn,
          descriptionHe: community.descriptionHe ?? '',
          descriptionEn: community.descriptionEn ?? '',
          sortOrder: String(community.sortOrder),
        }
      : EMPTY,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const a = (key: string) => t(`communities.admin.${key}`);
  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body = {
      slug: form.slug.trim(),
      nameHe: form.nameHe.trim(),
      nameEn: form.nameEn.trim(),
      descriptionHe: form.descriptionHe.trim() || null,
      descriptionEn: form.descriptionEn.trim() || null,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      await call(() =>
        community
          ? api.PUT('/api/v1/admin/communities/{id}', {
              params: { path: { id: community.id } },
              body,
            })
          : api.POST('/api/v1/admin/communities', { body }),
      );
      onDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void save(event)}
      className="grid gap-4 rounded-md border border-border p-4 sm:grid-cols-2"
    >
      <TextField
        label={a('slug')}
        hint={a('slugHint')}
        dir="ltr"
        value={form.slug}
        maxLength={64}
        onChange={(e) => set('slug', e.target.value)}
      />
      <TextField
        label={a('sortOrder')}
        type="number"
        min={0}
        max={1000}
        value={form.sortOrder}
        onChange={(e) => set('sortOrder', e.target.value)}
      />
      <TextField
        label={a('nameHe')}
        dir="rtl"
        lang="he"
        value={form.nameHe}
        maxLength={120}
        onChange={(e) => set('nameHe', e.target.value)}
      />
      <TextField
        label={a('nameEn')}
        dir="ltr"
        lang="en"
        value={form.nameEn}
        maxLength={120}
        onChange={(e) => set('nameEn', e.target.value)}
      />
      <TextField
        label={a('descriptionHe')}
        dir="rtl"
        lang="he"
        value={form.descriptionHe}
        maxLength={1000}
        onChange={(e) => set('descriptionHe', e.target.value)}
      />
      <TextField
        label={a('descriptionEn')}
        dir="ltr"
        lang="en"
        value={form.descriptionEn}
        maxLength={1000}
        onChange={(e) => set('descriptionEn', e.target.value)}
      />
      {error !== null && (
        <div className="sm:col-span-2">
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        </div>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <Button
          type="submit"
          pending={pending}
          disabled={!form.slug.trim() || !form.nameHe.trim() || !form.nameEn.trim()}
        >
          {a('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          {t('communities.post.cancel')}
        </Button>
      </div>
    </form>
  );
}
