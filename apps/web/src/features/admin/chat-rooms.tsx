'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { StoredImage, useUpload } from '@/features/content/files';
import { Pager } from '@/features/content/pager';
import { Link, useRouter } from '@/i18n/navigation';
import { errorMessage } from '@/lib/api-errors';
import { OwnerField, OwnerLine, firstOwner, ownerInput } from './owners';

type Schemas = components['schemas'];
type RoomList = Schemas['AdminRoomListDto'];
type Room = Schemas['AdminRoomDto'];
type RoomCategory = Schemas['AdminRoomCategoryDto'];
type ReportCategory = Schemas['AdminReportCategoryDto'];
type Candidate = Schemas['AdminMembershipListDto']['items'][number]['member'];
type Show = 'open' | 'archived' | 'all';

const link = 'font-semibold text-primary underline underline-offset-4';

function usePersonName() {
  const t = useTranslations('rooms.admin');
  return (person: { firstName: string | null; lastName: string | null }) =>
    [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || t('unknownPerson');
}

/** The rooms the association opened, with a way to open another. */
export function ChatRoomsPage() {
  const all = useTranslations();
  const t = useTranslations('rooms.admin');
  const g = useTranslations('groups.admin');
  const locale = useLocale();
  const name = usePersonName();
  const { api, call, me } = useAuth();
  const [show, setShow] = useState<Show>('open');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<RoomList | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() =>
      api.GET('/api/v1/admin/chat/rooms', {
        params: {
          query: {
            page,
            ...(show === 'all' ? {} : { archived: show === 'archived' ? 'true' : 'false' }),
          },
        },
      }),
    )
      .then((result) => active && setList(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, page, show]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{t('title')}</h1>
        <p className="mt-2 text-text-muted">{t('intro')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {/* No new rooms: communities replaced them (M25). Existing ones are archived. */}
        {me?.platformPermissions.includes('chat.rooms.manage') && (
          <Link href="/admin/chat/rooms/settings" className={link}>
            {t('settings')}
          </Link>
        )}
      </div>
      <SelectField
        label={t('show')}
        className="max-w-sm"
        value={show}
        onChange={(event) => {
          setShow(event.target.value as Show);
          setPage(1);
        }}
        options={[
          { value: 'open', label: t('showOpen') },
          { value: 'archived', label: t('showArchived') },
          { value: 'all', label: t('showAll') },
        ]}
      />
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!list && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {list && (
        <>
          <p className="text-sm text-text-muted" aria-live="polite">
            {t('total', { total: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p className="text-text-muted">{t('empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm" data-testid="admin-rooms-table">
                <thead className="bg-surface-muted">
                  <tr>
                    {(
                      ['colName', 'colCategory', 'colMembers', 'colModerators', 'colState'] as const
                    ).map((column) => (
                      <th key={column} scope="col" className="p-3 text-start">
                        {t(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.items.map((room) => (
                    <tr key={room.id}>
                      <td className="p-3">
                        <Link href={`/admin/chat/rooms/${room.id}`} className={link}>
                          {locale === 'he' ? room.nameHe : (room.nameEn ?? room.nameHe)}
                        </Link>
                      </td>
                      <td className="p-3">
                        {room.category
                          ? locale === 'he'
                            ? room.category.nameHe
                            : room.category.nameEn
                          : t('none')}
                      </td>
                      <td className="p-3">{room.memberCount}</td>
                      <td className="p-3">
                        {room.moderators.length === 0
                          ? t('none')
                          : room.moderators.map(name).join(', ')}
                      </td>
                      <td className="p-3">
                        {room.archived ? t('stateArchived') : t('stateOpen')}
                        {room.moderatorsOnly && (
                          <span className="block text-text-muted">{t('stateAnnouncements')}</span>
                        )}
                        {room.inviteOnly && (
                          <span className="block text-text-muted">{g('stateInviteOnly')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={list.pageSize} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

interface Draft {
  nameHe: string;
  nameEn: string;
  descriptionHe: string;
  descriptionEn: string;
  categoryId: string;
  pictureFileId: string | null;
  moderatorsOnly: boolean;
  inviteOnly: boolean;
}

const toDraft = (room: Room | null): Draft => ({
  nameHe: room?.nameHe ?? '',
  nameEn: room?.nameEn ?? '',
  descriptionHe: room?.descriptionHe ?? '',
  descriptionEn: room?.descriptionEn ?? '',
  categoryId: room?.category?.id ?? '',
  pictureFileId: room?.pictureFileId ?? null,
  moderatorsOnly: room?.moderatorsOnly ?? false,
  inviteOnly: room?.inviteOnly ?? false,
});

/** Opening a room, or changing one: its name, description, category, picture and moderators. */
export function ChatRoomEditorPage({ id }: { id?: string }) {
  const all = useTranslations();
  const t = useTranslations('rooms.admin');
  const e = useTranslations('rooms.admin.editor');
  const g = useTranslations('groups.admin');
  const locale = useLocale();
  const router = useRouter();
  const upload = useUpload();
  const pictureId = useId();
  const { api, call, me } = useAuth();
  // Whose the room is (M16): the platform's, for verified people, or an organisation's.
  const [owner, setOwner] = useState(() => firstOwner(me, 'chat.rooms.manage'));
  const [room, setRoom] = useState<Room | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/chat/room-categories'))
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    if (id) {
      call(() => api.GET('/api/v1/admin/chat/rooms/{id}', { params: { path: { id } } }))
        .then((result) => {
          if (!active) return;
          setRoom(result);
          setDraft(toDraft(result));
        })
        .catch((caught: unknown) => active && setError(caught));
    }
    return () => {
      active = false;
    };
  }, [api, call, id]);

  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };

  async function addPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      set({ pictureFileId: (await upload(file)).id });
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const body = {
      nameHe: draft.nameHe.trim(),
      nameEn: draft.nameEn.trim() || null,
      descriptionHe: draft.descriptionHe.trim() || null,
      descriptionEn: draft.descriptionEn.trim() || null,
      categoryId: draft.categoryId || null,
      pictureFileId: draft.pictureFileId,
      moderatorsOnly: draft.moderatorsOnly,
      inviteOnly: draft.inviteOnly,
    };
    try {
      if (id) {
        const updated = await call(() =>
          api.PUT('/api/v1/admin/chat/rooms/{id}', { params: { path: { id } }, body }),
        );
        setRoom(updated);
        setDraft(toDraft(updated));
        setSaved(true);
      } else {
        const created = await call(() =>
          api.POST('/api/v1/admin/chat/rooms', {
            body: { ...body, ...ownerInput(me, 'chat.rooms.manage', owner) },
          }),
        );
        router.push(`/admin/chat/rooms/${created.id}`);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (!id) return;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const path = { id };
      setRoom(
        archived
          ? await call(() =>
              api.POST('/api/v1/admin/chat/rooms/{id}/archive', { params: { path } }),
            )
          : await call(() =>
              api.POST('/api/v1/admin/chat/rooms/{id}/restore', { params: { path } }),
            ),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/chat/rooms" className={link}>
        {t('back')}
      </Link>
      <h1 className="text-3xl font-semibold text-brand-900">
        {id ? e('editTitle') : e('newTitle')}
      </h1>
      {id && !room && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {room?.archived && <Alert tone="warning">{t('stateArchived')}</Alert>}
      {(!id || room) && (
        <form onSubmit={save} noValidate className="flex max-w-2xl flex-col gap-4">
          {room ? (
            <OwnerLine permission="chat.rooms.manage" organisation={room.organisation} />
          ) : (
            <OwnerField permission="chat.rooms.manage" value={owner} onChange={setOwner} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={e('nameHe')}
              value={draft.nameHe}
              onChange={(event) => set({ nameHe: event.target.value })}
              dir="rtl"
              maxLength={80}
              required
            />
            <TextField
              label={e('nameEn')}
              value={draft.nameEn}
              onChange={(event) => set({ nameEn: event.target.value })}
              dir="ltr"
              maxLength={80}
            />
          </div>
          <TextareaField
            label={e('descriptionHe')}
            value={draft.descriptionHe}
            onChange={(event) => set({ descriptionHe: event.target.value })}
            dir="rtl"
            maxLength={500}
            rows={2}
          />
          <TextareaField
            label={e('descriptionEn')}
            value={draft.descriptionEn}
            onChange={(event) => set({ descriptionEn: event.target.value })}
            dir="ltr"
            maxLength={500}
            rows={2}
          />
          <SelectField
            label={e('category')}
            placeholder={e('noCategory')}
            className="max-w-sm"
            value={draft.categoryId}
            onChange={(event) => set({ categoryId: event.target.value })}
            options={categories.map((category) => ({
              value: category.id,
              label: locale === 'he' ? category.nameHe : category.nameEn,
            }))}
          />
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={draft.moderatorsOnly}
              onChange={(event) => set({ moderatorsOnly: event.target.checked })}
            />
            <span>{e('moderatorsOnly')}</span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={draft.inviteOnly}
              onChange={(event) => set({ inviteOnly: event.target.checked })}
            />
            <span>{g('inviteOnly')}</span>
          </label>
          <div className="flex flex-col gap-2">
            <label htmlFor={pictureId} className="font-semibold">
              {e('picture')}
            </label>
            {draft.pictureFileId && (
              <div className="flex flex-wrap items-center gap-4">
                <StoredImage
                  fileId={draft.pictureFileId}
                  variant="thumb"
                  alt={e('pictureAlt')}
                  className="size-24 rounded-md border border-border object-cover"
                />
                <Button type="button" variant="link" onClick={() => set({ pictureFileId: null })}>
                  {e('removePicture')}
                </Button>
              </div>
            )}
            <input
              id={pictureId}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(event) => void addPicture(event)}
              className="max-w-full text-sm"
            />
            {uploading && <p role="status">{all('membership.common.loading')}</p>}
          </div>
          {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
          {saved && <Alert tone="success">{e('saved')}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              pending={pending}
              disabled={uploading || draft.nameHe.trim().length < 2}
            >
              {id ? e('save') : e('create')}
            </Button>
            {room &&
              (room.archived ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void setArchived(false)}
                >
                  {e('restore')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void setArchived(true)}
                >
                  {e('archive')}
                </Button>
              ))}
            {room && (
              <Link href={`/chat/rooms/${room.id}`} className={link}>
                {e('openRoom')}
              </Link>
            )}
          </div>
          {room && !room.archived && <p className="text-sm text-text-muted">{e('archiveHint')}</p>}
        </form>
      )}
      {id && !room && error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {room && <Moderators room={room} onChanged={setRoom} />}
    </div>
  );
}

/** A room's moderators: the staff appoint active members, found by name or email. */
function Moderators({ room, onChanged }: { room: Room; onChanged: (room: Room) => void }) {
  const all = useTranslations();
  const t = useTranslations('rooms.admin.moderators');
  const name = usePersonName();
  const { api, call } = useAuth();
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const id = room.id;
  const already = new Set(room.moderators.map((person) => person.id));

  async function attempt(request: () => Promise<Room>) {
    setPending(true);
    setError(null);
    try {
      onChanged(await request());
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function find(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    if (q.length < 2) return;
    setPending(true);
    setError(null);
    try {
      const result = await call(() =>
        api.GET('/api/v1/admin/memberships', {
          params: { query: { status: 'ACTIVE', q, pageSize: 10 } },
        }),
      );
      setFound(result.items.map((item) => item.member));
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="room-moderators" className="flex max-w-2xl flex-col gap-3">
      <h2 id="room-moderators" className="text-2xl font-semibold text-brand-900">
        {t('title')}
      </h2>
      <p className="text-sm text-text-muted">{t('intro')}</p>
      {room.moderators.length === 0 ? (
        <p className="text-text-muted">{t('none')}</p>
      ) : (
        <ul data-testid="admin-room-moderators" className="flex flex-col gap-2">
          {room.moderators.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <span>{name(person)}</span>
              {person.id && (
                <Button
                  type="button"
                  variant="link"
                  disabled={pending}
                  aria-label={t('removeName', { name: name(person) })}
                  onClick={() =>
                    void attempt(() =>
                      call(() =>
                        api.POST('/api/v1/admin/chat/rooms/{id}/moderators/{userId}/remove', {
                          params: { path: { id, userId: person.id! } },
                        }),
                      ),
                    )
                  }
                >
                  {t('remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!room.archived && (
        <form role="search" onSubmit={find} className="flex flex-wrap items-end gap-3">
          <TextField
            label={t('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
          <Button type="submit" variant="secondary" disabled={search.trim().length < 2}>
            {t('searchButton')}
          </Button>
        </form>
      )}
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {found?.length === 0 && <p className="text-text-muted">{t('noResults')}</p>}
      {found && found.length > 0 && (
        <ul data-testid="moderator-candidates" className="flex flex-col gap-2">
          {found
            .filter((person) => !already.has(person.userId))
            .map((person) => (
              <li
                key={person.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <span>
                  {name(person)}
                  <span className="text-text-muted" dir="ltr">
                    {' · '}
                    {person.email}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  aria-label={t('appointName', { name: name(person) })}
                  onClick={() =>
                    void attempt(() =>
                      call(() =>
                        api.POST('/api/v1/admin/chat/rooms/{id}/moderators', {
                          params: { path: { id } },
                          body: { userId: person.userId },
                        }),
                      ),
                    )
                  }
                >
                  {t('appoint')}
                </Button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/** Room categories, and the reasons a member chooses from when reporting. */
export function ChatRoomSettingsPage() {
  const t = useTranslations('rooms.admin');
  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/admin/chat/rooms" className={link}>
          {t('back')}
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-brand-900">{t('categories.pageTitle')}</h1>
      </div>
      <KeyedList kind="rooms" />
      <KeyedList kind="reasons" />
    </div>
  );
}

type Row = { id: string; key: string; nameHe: string; nameEn: string; sortOrder: string } & (
  { rooms: number; active?: undefined } | { active: boolean; rooms?: undefined }
);

const toRow = (item: RoomCategory | ReportCategory): Row => ({
  id: item.id,
  key: item.key,
  nameHe: item.nameHe,
  nameEn: item.nameEn,
  sortOrder: String(item.sortOrder),
  ...('rooms' in item ? { rooms: item.rooms } : { active: item.active }),
});

const orderOf = (text: string) => (/^\d{1,4}$/.test(text.trim()) ? Number(text) : 0);

/**
 * One of the two short lists the staff keep: room categories (deleted only while no room uses
 * one) and report reasons (switched off, never deleted).
 */
function KeyedList({ kind }: { kind: 'rooms' | 'reasons' }) {
  const all = useTranslations();
  const c = useTranslations('rooms.admin.categories');
  const r = useTranslations('rooms.admin.reasons');
  const { api, call } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [key, setKey] = useState('');
  const [nameHe, setNameHe] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const reasons = kind === 'reasons';
  const headingId = `chat-${kind}`;

  useEffect(() => {
    let active = true;
    (reasons
      ? call(() => api.GET('/api/v1/admin/chat/report-categories'))
      : call(() => api.GET('/api/v1/admin/chat/room-categories'))
    )
      .then((result) => active && setRows(result.items.map(toRow)))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call, reasons, version]);

  async function attempt(request: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await request();
      setVersion((value) => value + 1);
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setPending(false);
    }
  }

  const change = (id: string, patch: Partial<Row>) =>
    setRows(
      (current) =>
        current?.map((row) => (row.id === id ? ({ ...row, ...patch } as Row) : row)) ?? null,
    );

  const save = (row: Row) =>
    attempt(() => {
      const params = { path: { id: row.id } };
      const body = {
        nameHe: row.nameHe.trim(),
        nameEn: row.nameEn.trim(),
        sortOrder: orderOf(row.sortOrder),
      };
      return reasons
        ? call(() =>
            api.PUT('/api/v1/admin/chat/report-categories/{id}', {
              params,
              body: { ...body, active: row.active ?? true },
            }),
          )
        : call(() => api.PUT('/api/v1/admin/chat/room-categories/{id}', { params, body }));
    });

  async function add(event: FormEvent) {
    event.preventDefault();
    const body = { key: key.trim(), nameHe: nameHe.trim(), nameEn: nameEn.trim(), sortOrder: 0 };
    const ok = await attempt(() =>
      reasons
        ? call(() =>
            api.POST('/api/v1/admin/chat/report-categories', { body: { ...body, active: true } }),
          )
        : call(() => api.POST('/api/v1/admin/chat/room-categories', { body })),
    );
    if (ok) {
      setKey('');
      setNameHe('');
      setNameEn('');
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div>
        <h2 id={headingId} className="text-2xl font-semibold text-brand-900">
          {reasons ? r('title') : c('title')}
        </h2>
        <p className="mt-1 text-text-muted">{reasons ? r('intro') : c('intro')}</p>
      </div>
      {error !== null && <Alert tone="error">{errorMessage(error, all)}</Alert>}
      {!rows && error === null && <p role="status">{all('membership.common.loading')}</p>}
      {rows?.length === 0 && <p className="text-text-muted">{c('empty')}</p>}
      {rows && rows.length > 0 && (
        <ul data-testid={`admin-chat-${kind}`} className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-md border border-border p-4">
              <p className="mb-3 text-sm text-text-muted">
                {c('key')}: <span dir="ltr">{row.key}</span>
                {row.rooms !== undefined && ` · ${c('rooms')}: ${row.rooms}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem] sm:items-end">
                <TextField
                  label={c('nameHe')}
                  value={row.nameHe}
                  onChange={(event) => change(row.id, { nameHe: event.target.value })}
                  dir="rtl"
                  maxLength={80}
                />
                <TextField
                  label={c('nameEn')}
                  value={row.nameEn}
                  onChange={(event) => change(row.id, { nameEn: event.target.value })}
                  dir="ltr"
                  maxLength={80}
                />
                <TextField
                  label={c('order')}
                  value={row.sortOrder}
                  onChange={(event) => change(row.id, { sortOrder: event.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
              {row.active !== undefined && (
                <label className="mt-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={row.active}
                    onChange={(event) => change(row.id, { active: event.target.checked })}
                  />
                  <span>{r('active')}</span>
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || !row.nameHe.trim() || !row.nameEn.trim()}
                  aria-label={c('saveName', { name: row.key })}
                  onClick={() => void save(row)}
                >
                  {c('save')}
                </Button>
                {row.rooms === 0 && (
                  <Button
                    type="button"
                    variant="link"
                    disabled={pending}
                    aria-label={c('deleteName', { name: row.key })}
                    onClick={() =>
                      void attempt(() =>
                        call(() =>
                          api.DELETE('/api/v1/admin/chat/room-categories/{id}', {
                            params: { path: { id: row.id } },
                          }),
                        ),
                      )
                    }
                  >
                    {c('delete')}
                  </Button>
                )}
              </div>
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
          onChange={(event) => setKey(event.target.value.toUpperCase())}
          dir="ltr"
          maxLength={40}
          className="sm:col-span-3"
        />
        <TextField
          label={c('nameHe')}
          value={nameHe}
          onChange={(event) => setNameHe(event.target.value)}
          dir="rtl"
          maxLength={80}
        />
        <TextField
          label={c('nameEn')}
          value={nameEn}
          onChange={(event) => setNameEn(event.target.value)}
          dir="ltr"
          maxLength={80}
        />
        <div>
          <Button
            type="submit"
            pending={pending}
            disabled={!key.trim() || !nameHe.trim() || !nameEn.trim()}
          >
            {reasons ? r('add') : c('add')}
          </Button>
        </div>
      </form>
    </section>
  );
}
