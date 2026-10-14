'use client';

import type { components } from '@medconnect/api-client';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';

type Schemas = components['schemas'];
export type Hospital = Schemas['HospitalListDto']['items'][number];
export type Department = Schemas['DepartmentListDto']['items'][number];
export type Subspecialty = Schemas['SubspecialtyListDto']['items'][number];
export type MembershipType = Schemas['MembershipTypeListDto']['items'][number];

/** The name in the page's language (reference data carries Hebrew and English). */
export function useLocalName() {
  const locale = useLocale();
  return (item: { nameHe: string; nameEn: string } | null | undefined) =>
    item ? (locale === 'he' ? item.nameHe : item.nameEn) : '';
}

export interface Reference {
  hospitals: Hospital[];
  subspecialties: Subspecialty[];
  types: MembershipType[];
}

/** Hospitals, subspecialties and membership types (public, cached lists). */
export function useReference(): Reference | null {
  const { api, call } = useAuth();
  const [reference, setReference] = useState<Reference | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      call(() => api.GET('/api/v1/hospitals')),
      call(() => api.GET('/api/v1/subspecialties')),
      call(() => api.GET('/api/v1/membership-types')),
    ])
      .then(([hospitals, subspecialties, types]) => {
        if (active) {
          setReference({
            hospitals: hospitals.items,
            subspecialties: subspecialties.items,
            types: types.items,
          });
        }
      })
      .catch(() => active && setReference({ hospitals: [], subspecialties: [], types: [] }));
    return () => {
      active = false;
    };
  }, [api, call]);
  return reference;
}

/** Departments of one hospital (empty while none is chosen). */
export function useDepartments(hospitalId: string): Department[] {
  const { api, call } = useAuth();
  const [departments, setDepartments] = useState<{ for: string; items: Department[] }>({
    for: '',
    items: [],
  });
  useEffect(() => {
    if (!hospitalId) return;
    let active = true;
    call(() =>
      api.GET('/api/v1/hospitals/{id}/departments', { params: { path: { id: hospitalId } } }),
    )
      .then((result) => active && setDepartments({ for: hospitalId, items: result.items }))
      .catch(() => active && setDepartments({ for: hospitalId, items: [] }));
    return () => {
      active = false;
    };
  }, [api, call, hospitalId]);
  return departments.for === hospitalId ? departments.items : [];
}
