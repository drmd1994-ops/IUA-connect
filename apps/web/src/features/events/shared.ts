'use client';

import { useFormatter } from 'next-intl';
import { tokenStore } from '@/features/auth/token-store';

/** Event times are shown in the event's own time zone (Israel), whatever the reader's device. */
export function useEventTime() {
  const format = useFormatter();
  return {
    dateTime: (iso: string, timeZone: string) =>
      format.dateTime(new Date(iso), { dateStyle: 'full', timeStyle: 'short', timeZone }),
    day: (iso: string, timeZone: string) =>
      format.dateTime(new Date(iso), { dateStyle: 'full', timeZone }),
    time: (iso: string, timeZone: string) =>
      format.dateTime(new Date(iso), { timeStyle: 'short', timeZone }),
    /** "9 Jan 2030, 09:00 – 18:00", or both dates when the event spans several days. */
    range: (startIso: string, endIso: string, timeZone: string) =>
      format.dateTimeRange(new Date(startIso), new Date(endIso), {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone,
      }),
    /** The day as YYYY-MM-DD in the event's zone, for grouping sessions by day. */
    dayKey: (iso: string, timeZone: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(iso)),
  };
}

/**
 * Downloads a file from the API with the reader's session (members-only calendar files and
 * admin exports need the access token, which a plain link can't carry). Throws on failure.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = tokenStore.get();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
