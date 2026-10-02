'use client';

import type { components } from '@iua/api-client';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api-errors';

type Settings = components['schemas']['SettingsDto'];

/** The site settings: the association's contact details and the notice banner. */
export function SettingsPage() {
  const t = useTranslations();
  const s = (key: string) => t(`portal.admin.settings.${key}`);
  const { api, call } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    call(() => api.GET('/api/v1/admin/settings'))
      .then((result) => active && setSettings(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [api, call]);

  const contact = (patch: Partial<Settings['contact']>) => {
    setSaved(false);
    setSettings((current) => current && { ...current, contact: { ...current.contact, ...patch } });
  };
  const notice = (patch: Partial<Settings['notice']>) => {
    setSaved(false);
    setSettings((current) => current && { ...current, notice: { ...current.notice, ...patch } });
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      setSettings(await call(() => api.PUT('/api/v1/admin/settings', { body: settings })));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-brand-900">{s('title')}</h1>
        <p className="mt-2 text-text-muted">{s('intro')}</p>
      </div>
      {!settings && error === null && <p role="status">{t('membership.common.loading')}</p>}
      {!settings && error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
      {settings && (
        <form onSubmit={save} noValidate className="flex flex-col gap-8">
          <fieldset disabled={pending} className="flex flex-col gap-5">
            <legend className="mb-1 text-xl font-semibold">{s('contact')}</legend>
            <p className="text-sm text-text-muted">{s('contactHint')}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={s('email')}
                type="email"
                dir="ltr"
                maxLength={254}
                value={settings.contact.email}
                onChange={(event) => contact({ email: event.target.value })}
              />
              <TextField
                label={s('phone')}
                type="tel"
                dir="ltr"
                maxLength={21}
                value={settings.contact.phone}
                onChange={(event) => contact({ phone: event.target.value })}
              />
              <TextField
                label={s('addressHe')}
                lang="he"
                dir="rtl"
                maxLength={300}
                value={settings.contact.addressHe}
                onChange={(event) => contact({ addressHe: event.target.value })}
              />
              <TextField
                label={s('addressEn')}
                lang="en"
                dir="ltr"
                maxLength={300}
                value={settings.contact.addressEn}
                onChange={(event) => contact({ addressEn: event.target.value })}
              />
            </div>
          </fieldset>

          <fieldset disabled={pending} className="flex flex-col gap-5">
            <legend className="mb-1 text-xl font-semibold">{s('notice')}</legend>
            <p className="text-sm text-text-muted">{s('noticeHint')}</p>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="size-4"
                checked={settings.notice.enabled}
                onChange={(event) => notice({ enabled: event.target.checked })}
              />
              {s('noticeEnabled')}
            </label>
            <TextareaField
              label={s('noticeHe')}
              lang="he"
              dir="rtl"
              rows={2}
              maxLength={300}
              value={settings.notice.textHe}
              onChange={(event) => notice({ textHe: event.target.value })}
            />
            <TextareaField
              label={s('noticeEn')}
              lang="en"
              dir="ltr"
              rows={2}
              maxLength={300}
              value={settings.notice.textEn}
              onChange={(event) => notice({ textEn: event.target.value })}
            />
          </fieldset>

          {error !== null && <Alert tone="error">{errorMessage(error, t)}</Alert>}
          {saved && <Alert tone="success">{s('saved')}</Alert>}
          <div>
            <Button type="submit" pending={pending}>
              {s('save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
