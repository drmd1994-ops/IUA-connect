'use client';

import { useTranslations } from 'next-intl';
import { SelectField } from '@/components/ui/select-field';
import { useLocalName, useReference } from '@/features/membership/reference';

export type Tier = 'PUBLIC' | 'VERIFIED' | 'MEMBERS' | 'TYPES';

/**
 * "Who can read" (decision D7; M16): everyone, verified physicians, the members of the
 * organisation that owns the item, or chosen membership types.
 *
 * `owner` is the organisation the item belongs to, or null for the platform's own. The platform
 * has no members, so its items are not offered "members only"; and an organisation's item names
 * its own membership types.
 */
export function TierFields({
  label,
  typesLabel,
  tier,
  typeIds,
  owner,
  onChange,
}: {
  label: string;
  typesLabel: string;
  tier: Tier;
  typeIds: string[];
  owner: string | null;
  onChange: (tier: Tier, typeIds: string[]) => void;
}) {
  const t = useTranslations('content.common.tiers');
  const name = useLocalName();
  const reference = useReference();
  const tiers: Tier[] =
    owner === null ? ['PUBLIC', 'VERIFIED', 'TYPES'] : ['PUBLIC', 'VERIFIED', 'MEMBERS', 'TYPES'];
  const types = (reference?.types ?? []).filter(
    (type) => owner === null || type.organisation.id === owner,
  );
  // Several organisations' types in one list: say whose each is.
  const several = new Set(types.map((type) => type.organisation.id)).size > 1;
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={label}
        value={tier}
        onChange={(event) => onChange(event.target.value as Tier, typeIds)}
        options={tiers.map((value) => ({ value, label: t(value) }))}
      />
      {tier === 'TYPES' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{typesLabel}</legend>
          {types.map((type) => (
            <label key={type.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={typeIds.includes(type.id)}
                onChange={() =>
                  onChange(
                    tier,
                    typeIds.includes(type.id)
                      ? typeIds.filter((id) => id !== type.id)
                      : [...typeIds, type.id],
                  )
                }
              />
              {several ? `${name(type)} (${name(type.organisation)})` : name(type)}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** The settings the platform's own content may carry (the library, the questions, guidelines). */
export type PlatformTier = Exclude<Tier, 'MEMBERS'>;

/** An item of the platform has no "members": what was meant is every verified physician. */
export const platformTier = (tier: Tier): PlatformTier => (tier === 'MEMBERS' ? 'VERIFIED' : tier);
