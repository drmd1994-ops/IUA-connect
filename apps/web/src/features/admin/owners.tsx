'use client';

import { useTranslations } from 'next-intl';
import { SelectField } from '@/components/ui/select-field';
import { type Me, useAuth } from '@/features/auth/auth-context';
import { useLocalName } from '@/features/membership/reference';

/**
 * Whose a thing is (M16): an organisation's, or the platform's own. Staff hold each permission
 * on the platform or inside an organisation, so "may this person publish news?" has no answer
 * until one asks "whose news?". The server checks it on every request; these helpers only
 * decide what the screens offer.
 */
export interface Owner {
  /** The organisation's id; null for the platform itself. */
  id: string | null;
  nameHe: string;
  nameEn: string;
}

/** The value a select carries for the platform (an organisation's is its id). */
export const PLATFORM = 'platform';

/** The owners the person may use this permission for: their organisations, and the platform. */
export function ownersFor(me: Me | null, permission: string): Owner[] {
  if (!me) return [];
  const organisations: Owner[] = me.organisations
    .filter((held) => held.permissions.includes(permission))
    .map((held) => held.organisation);
  return me.platformPermissions.includes(permission)
    ? [...organisations, { id: null, nameHe: '', nameEn: '' }]
    : organisations;
}

/** Whether the person may use the permission on a thing of that owner. */
export function canOn(me: Me | null, permission: string, organisationId: string | null): boolean {
  if (!me) return false;
  // Platform staff who may work inside organisations hold what they hold everywhere.
  if (me.platformPermissions.includes(permission)) {
    if (organisationId === null || me.platformPermissions.includes('organisations.access')) {
      return true;
    }
  }
  return me.organisations.some(
    (held) => held.organisation.id === organisationId && held.permissions.includes(permission),
  );
}

/** The owners for a permission, and how each is called on the page. */
export function useOwners(permission: string) {
  const { me } = useAuth();
  const t = useTranslations('content.common.owner');
  const name = useLocalName();
  const owners = ownersFor(me, permission);
  const label = (owner: { id: string | null; nameHe: string; nameEn: string } | null) =>
    owner === null || owner.id === null ? t('platform') : name(owner);
  return { owners, label };
}

/**
 * The owner of a new thing. A person with one place to work in is not asked: the field shows
 * nothing and the request leaves the owner out. Someone with several says which, and sees what
 * they chose. `value` is an organisation's id, or PLATFORM.
 */
export function OwnerField({
  permission,
  value,
  onChange,
}: {
  permission: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('content.common.owner');
  const { owners, label } = useOwners(permission);
  if (owners.length < 2) return null;
  return (
    <SelectField
      label={t('label')}
      hint={t('hint')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={owners.map((owner) => ({ value: owner.id ?? PLATFORM, label: label(owner) }))}
    />
  );
}

/** The owner a new thing starts with: the person's first organisation, else the platform. */
export function firstOwner(me: Me | null, permission: string): string {
  const [first] = ownersFor(me, permission);
  return first ? (first.id ?? PLATFORM) : PLATFORM;
}

/**
 * What a "create" request says about the owner: nothing when the person has one place to work
 * in (the server fills it in), otherwise the organisation's id, or null for the platform.
 */
export function ownerInput(
  me: Me | null,
  permission: string,
  value: string,
): { organisationId?: string | null } {
  if (ownersFor(me, permission).length < 2) return {};
  return { organisationId: value === PLATFORM ? null : value };
}

/** A line saying whose an existing thing is; nothing while there is only one owner to speak of. */
export function OwnerLine({
  permission,
  organisation,
}: {
  permission: string;
  organisation: { id: string; nameHe: string; nameEn: string } | null;
}) {
  const t = useTranslations('content.common.owner');
  const { owners, label } = useOwners(permission);
  if (owners.length < 2) return null;
  return (
    <p className="text-sm text-text-muted">
      {t('of', { owner: label(organisation ?? { id: null, nameHe: '', nameEn: '' }) })}
    </p>
  );
}
