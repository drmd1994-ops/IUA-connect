'use client';

import type { components } from '@iua/api-client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';

export type UploadedFile = components['schemas']['FileDto'];

/**
 * A short-lived signed address for a stored file (5 minutes; the API checks who may read it).
 * Null while loading, or when the reader isn't allowed to see the file.
 */
export function useFileUrl(fileId: string | null, variant: 'full' | 'thumb' = 'full') {
  const { api, call, status } = useAuth();
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null });
  const key = fileId ? `${fileId}:${variant}:${status}` : '';

  useEffect(() => {
    if (!fileId || status === 'loading') return;
    let active = true;
    call(() =>
      api.GET('/api/v1/files/{id}/url', {
        params: { path: { id: fileId }, query: { v: variant } },
      }),
    )
      .then((result) => active && setState({ key, url: result.url }))
      .catch(() => active && setState({ key, url: null }));
    return () => {
      active = false;
    };
  }, [api, call, fileId, variant, status, key]);

  return state.key === key ? state.url : null;
}

/** Uploads one file (multipart). The API detects the type from the content and re-encodes images. */
export function useUpload() {
  const { api, call } = useAuth();
  return (file: File): Promise<UploadedFile> =>
    call(() =>
      api.POST('/api/v1/files', {
        body: { file: '' },
        bodySerializer: () => {
          const form = new FormData();
          form.append('file', file);
          return form;
        },
      }),
    );
}

/**
 * An image served through a signed address. Until the address is known it renders nothing, or,
 * with `placeholder`, an empty box of the same size, so what follows doesn't jump when the
 * picture arrives (the classes must then give the box its size, e.g. an aspect ratio).
 */
export function StoredImage({
  fileId,
  alt,
  variant = 'full',
  className = '',
  placeholder = false,
}: {
  fileId: string;
  alt: string;
  variant?: 'full' | 'thumb';
  className?: string;
  placeholder?: boolean;
}) {
  const url = useFileUrl(fileId, variant);
  if (!url) {
    return placeholder ? (
      <div aria-hidden="true" className={`bg-surface-muted ${className}`} />
    ) : null;
  }
  // Signed, short-lived addresses can't go through the framework's image optimiser.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

export function formatSize(bytes: number, locale: string): string {
  const format = (value: number, unit: 'kilobyte' | 'megabyte') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  return bytes >= 1_048_576
    ? format(bytes / 1_048_576, 'megabyte')
    : format(bytes / 1024, 'kilobyte');
}
