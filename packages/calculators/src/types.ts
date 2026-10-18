/**
 * What a calculator is made of (M30 plan §2): its inputs, its calculation, the source it comes
 * from and who reviewed it. Every text a person reads is a key in the `calculators` messages
 * (`calculators.<id>.…`), so the site and the app show the same words in both languages.
 */

export type CalculatorKind = 'questionnaire' | 'score' | 'formula';

/** A number typed by the person. The range is what the calculator accepts, in `unit`. */
export interface NumberField {
  key: string;
  type: 'number';
  /** A key in `calculators.units`. */
  unit: string;
  min: number;
  max: number;
  /** How many decimals may be typed. 0: whole numbers only. */
  decimals: number;
  /**
   * The unit is chosen in another field: the range then depends on that choice. The field named
   * here is a choice field whose options are units.
   */
  unitFrom?: {
    field: string;
    ranges: Record<string, { min: number; max: number; decimals: number }>;
  };
}

/** One answer among a few. Each option's words are `calculators.<id>.options.<set>.<value>`. */
export interface ChoiceField {
  key: string;
  type: 'choice';
  options: readonly string[];
  /** The group of option texts; several questions may share one scale. */
  set: string;
  /** Chosen until the person changes it; most choices have none, so nothing is assumed. */
  initial?: string;
}

export type Field = NumberField | ChoiceField;

/** What the person typed or chose, by field key, before it is checked. */
export type RawValues = Readonly<Record<string, string | undefined>>;

/** The checked values: a number for a number field, the chosen option for a choice. */
export type Values = Readonly<Record<string, number | string>>;

export type FieldProblem =
  | { field: string; code: 'required' }
  | { field: string; code: 'notNumber'; decimals: number }
  | { field: string; code: 'outOfRange'; min: number; max: number; unit: string };

export interface Part {
  /** A key in `calculators.<id>.parts`. */
  key: string;
  value: number | string;
  /** A key in `calculators.units`, if the value has one. */
  unit?: string;
  decimals?: number;
}

export interface Result {
  value: number;
  /** Decimals the value is shown with; the interpretation is read from the shown value. */
  decimals: number;
  /** A key in `calculators.units`. */
  unit?: string;
  /** Written instead of the bare number, as the score is usually written (e.g. "8ah"). */
  label?: string;
  /** A key in `calculators.<id>.bands`: what the value means, as the source puts it. */
  band?: string;
  parts?: Part[];
  /** Keys in `calculators.<id>.notes`, shown under the result. */
  notes?: string[];
}

export type Outcome = { ok: true; result: Result } | { ok: false; problems: FieldProblem[] };

export interface Calculator {
  id: string;
  kind: CalculatorKind;
  fields: readonly Field[];
  /** Called only with values that passed the fields' own checks. */
  compute: (values: Values) => Result;
  reference: {
    /** As the source is cited; not translated. */
    citation: string;
    doi?: string;
    /** Where it may be read when it has no DOI, or a page that explains it. */
    url?: string;
  };
  /** The version of the formula or questionnaire, when it has several (e.g. "CKD-EPI 2021"). */
  version?: string;
  /**
   * The physician who checked the formula, the cut-offs and the texts, and when (plan §3).
   * Empty until they have: the screen then says it is not reviewed yet.
   */
  review: { by: string; on: string } | null;
  /** The Hebrew wording is ours, not a validated translation (plan §10, answer 4). */
  hebrewNotValidated?: boolean;
}
