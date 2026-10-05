import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/config';
import { useSession } from '@/session/session-provider';

type Variant = 'full' | 'thumb';
interface Signed {
  url: string;
}

/** Where a signed address of the API leads from the phone: the API answers a path. */
export function absoluteFileUrl(base: string, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${base.replace(/\/+$/, '')}${path}`;
}

/** A file's size in the unit a person reads: whole kilobytes, or megabytes with one decimal. */
export function sizeParts(bytes: number): { unit: 'kb' | 'mb'; value: number } {
  return bytes >= 1_048_576
    ? { unit: 'mb', value: Math.round((bytes / 1_048_576) * 10) / 10 }
    : { unit: 'kb', value: Math.max(1, Math.round(bytes / 1024)) };
}

/** Asks for a short-lived signed address of a stored file; the API checks who may read it. */
export function useSignFile() {
  const { request } = useSession();
  return useCallback(
    async (fileId: string, variant: Variant = 'full') => {
      const signed = await request<Signed>(
        `/api/v1/files/${encodeURIComponent(fileId)}/url?v=${variant}`,
      );
      return absoluteFileUrl(API_URL, signed.url);
    },
    [request],
  );
}

/** The signed address of a picture. Null while it is asked for, or when it may not be seen. */
export function useFileUrl(fileId: string | null, variant: Variant = 'full'): string | null {
  const sign = useSignFile();
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null });
  const key = fileId ? `${fileId}:${variant}` : '';

  useEffect(() => {
    if (!fileId) return;
    let active = true;
    sign(fileId, variant)
      .then((url) => active && setState({ key, url }))
      .catch(() => active && setState({ key, url: null }));
    return () => {
      active = false;
    };
  }, [sign, fileId, variant, key]);

  return state.key === key ? state.url : null;
}
