import type { components } from '@medconnect/api-client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';

type Schemas = components['schemas'];
export type Subspecialty = Schemas['SubspecialtyListDto']['items'][number];
export type Hospital = Schemas['HospitalListDto']['items'][number];

/** The name of something that has one in each language, in the reader's. */
export function useLocalName() {
  const locale = useLocale();
  return useCallback(
    (item: { nameHe: string; nameEn: string | null }) =>
      locale === 'en' ? (item.nameEn ?? item.nameHe) : item.nameHe,
    [locale],
  );
}

/**
 * A list the forms and filters choose from. Empty until it arrives; a failure leaves it empty.
 * These lists may be kept by the phone for five minutes, and an answer the phone revalidates can
 * come back with no body at all: anything that is not a list is read as no answer.
 */
function useList<T>(path: string): T[] {
  const { request } = useSession();
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let active = true;
    request<{ items?: unknown }>(path)
      .then((result) => active && Array.isArray(result.items) && setItems(result.items as T[]))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, path]);
  return items;
}

export const useSubspecialties = () => useList<Subspecialty>('/api/v1/subspecialties');
export const useHospitals = () => useList<Hospital>('/api/v1/hospitals');
