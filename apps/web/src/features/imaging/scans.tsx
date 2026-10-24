'use client';

import type { components } from '@medconnect/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { Link } from '@/i18n/navigation';

export type Scan = components['schemas']['ScanDto'];
export const MAX_SCANS = 3;

/** DICOM files carry "DICM" after a 128-byte preamble; anything else in a scan's folder is left out. */
async function isDicom(file: File): Promise<boolean> {
  if (file.size < 132) return false;
  const head = new Uint8Array(await file.slice(128, 132).arrayBuffer());
  return String.fromCharCode(...head) === 'DICM';
}

/** One scan's kinds of images, series and images, in a line. */
export function ScanSummary({ scan }: { scan: Scan }) {
  const t = useTranslations('imaging.scans');
  return (
    <span>
      {t('summary', {
        modalities: scan.modalities,
        series: scan.seriesCount,
        images: scan.instanceCount,
      })}
    </span>
  );
}

/**
 * The scans of a case or a library item, each with its way into the viewer (a page of this site
 * that opens the viewer in a new tab), under the standing education-only notice.
 */
export function ScanList({ scans }: { scans: Scan[] }) {
  const t = useTranslations('imaging.scans');
  if (scans.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="scans">
      <p className="text-sm font-semibold text-text-muted">{t('notice')}</p>
      <ul className="flex flex-col gap-2">
        {scans.map((scan, index) => (
          <li
            key={scan.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <ScanSummary scan={scan} />
            <Link
              href={`/scans/${scan.id}`}
              target="_blank"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {scans.length > 1 ? t('viewNumber', { number: index + 1 }) : t('view')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Adding scans to a form: the uploader confirms the images show nothing identifying, then picks a
 * scan's files or its folder. Only DICOM files are sent; the server removes the patient's details
 * from them before anything is stored. `onError` receives what the server refused.
 */
export function ScanPicker({
  scans,
  onChange,
  onError,
  onBusy,
}: {
  scans: Scan[];
  onChange: (scans: Scan[]) => void;
  onError: (error: unknown) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const t = useTranslations('imaging.scans');
  const { api, call } = useAuth();
  const [confirmed, setConfirmed] = useState(scans.length > 0);
  const [uploading, setUploading] = useState(false);
  const [noDicom, setNoDicom] = useState(false);
  const ready = confirmed && !uploading && scans.length < MAX_SCANS;

  async function add(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!ready || chosen.length === 0) return;
    setNoDicom(false);
    onError(null);
    const files = (
      await Promise.all(chosen.map(async (file) => ((await isDicom(file)) ? file : null)))
    ).filter((file): file is File => file !== null);
    if (files.length === 0) {
      setNoDicom(true);
      return;
    }
    setUploading(true);
    onBusy?.(true);
    try {
      const scan = await call(() =>
        api.POST('/api/v1/imaging/scans', {
          params: { query: { confirmed: 'true' } },
          body: { files: [] },
          bodySerializer: () => {
            const data = new FormData();
            for (const file of files) data.append('files', file);
            return data;
          },
        }),
      );
      onChange([...scans, scan]);
    } catch (caught) {
      onError(caught);
    } finally {
      setUploading(false);
      onBusy?.(false);
    }
  }

  const pick = (label: string, folder: boolean) => (
    <label
      className={`inline-flex w-fit items-center rounded-md border border-border px-4 py-2 font-semibold ${
        ready ? 'cursor-pointer hover:bg-surface-muted' : 'opacity-60'
      }`}
    >
      {label}
      <input
        type="file"
        multiple
        className="sr-only"
        disabled={!ready}
        onChange={(event) => void add(event)}
        {...(folder ? { webkitdirectory: '', directory: '' } : {})}
      />
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-3" data-testid="scan-picker">
      <legend className="mb-1 font-semibold">{t('title')}</legend>
      <p className="text-sm text-text-muted">{t('hint')}</p>
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          className="size-4"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {t('confirm')}
      </label>
      {scans.length > 0 && (
        <ul className="flex flex-col gap-2">
          {scans.map((scan, index) => (
            <li
              key={scan.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <ScanSummary scan={scan} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => onChange(scans.filter((s) => s.id !== scan.id))}
              >
                {t('remove', { number: index + 1 })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {scans.length < MAX_SCANS && (
        <div className="flex flex-wrap gap-2">
          {pick(t('addFiles'), false)}
          {pick(t('addFolder'), true)}
        </div>
      )}
      {uploading && <p role="status">{t('uploading')}</p>}
      {noDicom && <p role="alert">{t('noDicom')}</p>}
    </fieldset>
  );
}

/** The viewer's address for a scan: OHIF under /viewer, in the site's language. */
export function useViewerAddress() {
  const locale = useLocale();
  return useCallback(
    (link: { configUrl: string; studyUid: string }) => {
      const query = new URLSearchParams({
        url: link.configUrl,
        studyInstanceUIDs: link.studyUid,
        lng: locale === 'he' ? 'he' : 'en-US',
      });
      return `/viewer/viewer/medconnect?${query.toString()}`;
    },
    [locale],
  );
}
