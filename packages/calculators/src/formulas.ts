import { choice, num, round } from './evaluate';
import type { Calculator, NumberField, Values } from './types';

/** µmol/L in one mg/dL of creatinine, as the CKD-EPI equations use it. */
export const CREATININE_UMOL_PER_MGDL = 88.4;

const creatinineUnit = {
  key: 'creatinineUnit',
  type: 'choice',
  options: ['mgdl', 'umoll'],
  set: 'creatinineUnit',
  initial: 'mgdl',
} as const;

const creatinine: NumberField = {
  key: 'creatinine',
  type: 'number',
  unit: 'mgdl',
  min: 0.1,
  max: 20,
  decimals: 2,
  unitFrom: {
    field: 'creatinineUnit',
    ranges: { mgdl: { min: 0.1, max: 20, decimals: 2 }, umoll: { min: 9, max: 1768, decimals: 0 } },
  },
};

const sex = { key: 'sex', type: 'choice', options: ['female', 'male'], set: 'sex' } as const;
const adultAge: NumberField = {
  key: 'age',
  type: 'number',
  unit: 'years',
  min: 18,
  max: 120,
  decimals: 0,
};

/** Serum creatinine in mg/dL, whichever unit it was typed in. */
function creatinineMgdl(values: Values): number {
  const value = num(values, 'creatinine');
  return choice(values, 'creatinineUnit') === 'umoll' ? value / CREATININE_UMOL_PER_MGDL : value;
}

const psa = (key: string): NumberField => ({
  key,
  type: 'number',
  unit: 'ngml',
  min: 0.01,
  max: 10000,
  decimals: 2,
});

/** PSA density: serum PSA divided by the prostate's volume. */
export const psaDensity: Calculator = {
  id: 'psaDensity',
  kind: 'formula',
  fields: [
    psa('psa'),
    { key: 'volume', type: 'number', unit: 'ml', min: 5, max: 500, decimals: 1 },
  ],
  compute(values) {
    const value = round(num(values, 'psa') / num(values, 'volume'), 2);
    return {
      value,
      decimals: 2,
      unit: 'ngmlml',
      band: value >= 0.15 ? 'atOrAbove' : 'below',
      notes: ['volume'],
    };
  },
  reference: {
    citation:
      'Benson MC, Whang IS, Pantuck A, et al. Prostate specific antigen density: a means of distinguishing benign prostatic hypertrophy and prostate cancer. J Urol. 1992;147(3 Pt 2):815-6.',
    doi: '10.1016/s0022-5347(17)37393-7',
  },
  review: { by: 'Dr. Dahamshy', on: '2026-10-19' },
};

/**
 * PSA velocity: the change in PSA per year between two measurements. With two measurements it is
 * the difference over the time between them.
 */
export const psaVelocity: Calculator = {
  id: 'psaVelocity',
  kind: 'formula',
  fields: [
    psa('first'),
    psa('last'),
    { key: 'months', type: 'number', unit: 'months', min: 1, max: 240, decimals: 0 },
  ],
  compute(values) {
    const months = num(values, 'months');
    const value = round((num(values, 'last') - num(values, 'first')) / (months / 12), 2);
    return {
      value,
      decimals: 2,
      unit: 'ngmlyear',
      band: value >= 0.75 ? 'atOrAbove' : 'below',
      notes: months < 18 ? ['short', 'method'] : ['method'],
    };
  },
  reference: {
    citation:
      'Carter HB, Pearson JD, Metter EJ, et al. Longitudinal evaluation of prostate-specific antigen levels in men with and without prostate disease. JAMA. 1992;267(16):2215-20.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/1372942/',
  },
  review: { by: 'Dr. Dahamshy', on: '2026-10-19' },
};

/** Creatinine clearance by Cockcroft and Gault, in mL/min (not adjusted to body surface). */
export const creatinineClearance: Calculator = {
  id: 'creatinineClearance',
  kind: 'formula',
  fields: [
    adultAge,
    sex,
    { key: 'weight', type: 'number', unit: 'kg', min: 30, max: 250, decimals: 1 },
    creatinineUnit,
    creatinine,
  ],
  compute(values) {
    const age = num(values, 'age');
    const female = choice(values, 'sex') === 'female';
    const clearance =
      (((140 - age) * num(values, 'weight')) / (72 * creatinineMgdl(values))) * (female ? 0.85 : 1);
    return { value: round(clearance, 0), decimals: 0, unit: 'mlmin', notes: ['weight'] };
  },
  reference: {
    citation:
      'Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. Nephron. 1976;16(1):31-41.',
    doi: '10.1159/000180580',
  },
  review: { by: 'Dr. Dahamshy', on: '2026-10-19' },
};

/** The stage of GFR in KDIGO's classification of chronic kidney disease. */
export function gfrStage(egfr: number): string {
  if (egfr >= 90) return 'g1';
  if (egfr >= 60) return 'g2';
  if (egfr >= 45) return 'g3a';
  if (egfr >= 30) return 'g3b';
  if (egfr >= 15) return 'g4';
  return 'g5';
}

/**
 * eGFR by the CKD-EPI creatinine equation of 2021, without race (plan §10, answer 2):
 * 142 × min(Scr/κ, 1)^α × max(Scr/κ, 1)^−1.200 × 0.9938^age × 1.012 if female,
 * κ 0.7 (female) or 0.9 (male), α −0.241 (female) or −0.302 (male).
 */
export const egfr: Calculator = {
  id: 'egfr',
  kind: 'formula',
  fields: [adultAge, sex, creatinineUnit, creatinine],
  compute(values) {
    const female = choice(values, 'sex') === 'female';
    const kappa = female ? 0.7 : 0.9;
    const alpha = female ? -0.241 : -0.302;
    const ratio = creatinineMgdl(values) / kappa;
    const value = round(
      142 *
        Math.min(ratio, 1) ** alpha *
        Math.max(ratio, 1) ** -1.2 *
        0.9938 ** num(values, 'age') *
        (female ? 1.012 : 1),
      0,
    );
    return { value, decimals: 0, unit: 'mlmin173', band: gfrStage(value), notes: ['steady'] };
  },
  reference: {
    citation:
      'Inker LA, Eneanya ND, Coresh J, et al. New creatinine- and cystatin C-based equations to estimate GFR without race. N Engl J Med. 2021;385(19):1737-49.',
    doi: '10.1056/NEJMoa2102953',
  },
  version: 'CKD-EPI 2021',
  review: { by: 'Dr. Dahamshy', on: '2026-10-19' },
};

const diameter = (key: string): NumberField => ({
  key,
  type: 'number',
  unit: 'mm',
  min: 1,
  max: 200,
  decimals: 1,
});

/**
 * A stone's volume from its three diameters, as an ellipsoid: π/6 × length × width × depth; and
 * its area on one image, as an ellipse: π/4 × length × width.
 */
export const stoneVolume: Calculator = {
  id: 'stoneVolume',
  kind: 'formula',
  fields: [diameter('length'), diameter('width'), diameter('depth')],
  compute(values) {
    const length = num(values, 'length');
    const width = num(values, 'width');
    return {
      value: round((Math.PI / 6) * length * width * num(values, 'depth'), 0),
      decimals: 0,
      unit: 'mm3',
      parts: [
        { key: 'area', value: round((Math.PI / 4) * length * width, 0), unit: 'mm2', decimals: 0 },
      ],
    };
  },
  reference: {
    citation:
      'Tiselius HG, Andersson A. Stone burden in an average Swedish population of stone formers requiring active stone removal: how can the stone size be estimated in the clinical routine? Eur Urol. 2003;43(3):275-81.',
    doi: '10.1016/s0302-2838(03)00006-x',
  },
  review: { by: 'Dr. Dahamshy', on: '2026-10-19' },
};
