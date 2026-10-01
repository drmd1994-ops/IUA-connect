'use client';

import { useTranslations } from 'next-intl';
import { SelectField } from '@/components/ui/select-field';
import { useLocalName, useReference } from '@/features/membership/reference';

export type Tier = 'PUBLIC' | 'MEMBERS' | 'TYPES';
const TIERS: Tier[] = ['PUBLIC', 'MEMBERS', 'TYPES'];

/** "Who can read": everyone, members, or chosen membership types (decision D7). */
export function TierFields({
  label,
  typesLabel,
  tier,
  typeIds,
  onChange,
}: {
  label: string;
  typesLabel: string;
  tier: Tier;
  typeIds: string[];
  onChange: (tier: Tier, typeIds: string[]) => void;
}) {
  const t = useTranslations('content.common.tiers');
  const name = useLocalName();
  const reference = useReference();
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label={label}
        value={tier}
        onChange={(event) => onChange(event.target.value as Tier, typeIds)}
        options={TIERS.map((value) => ({ value, label: t(value) }))}
      />
      {tier === 'TYPES' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">{typesLabel}</legend>
          {(reference?.types ?? []).map((type) => (
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
              {name(type)}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
