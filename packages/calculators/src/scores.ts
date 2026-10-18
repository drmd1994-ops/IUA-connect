import { choice, num } from './evaluate';
import type { Calculator } from './types';

const points = (table: Record<string, number>, value: string): number => {
  const found = table[value];
  if (found === undefined) throw new Error(`no points for ${value}`);
  return found;
};

/**
 * The R.E.N.A.L. nephrometry score of a renal mass: four parts of 1 to 3 points, with the
 * anterior/posterior letter and "h" for a hilar mass written after the sum.
 */
export const renal: Calculator = {
  id: 'renal',
  kind: 'score',
  fields: [
    { key: 'diameter', type: 'number', unit: 'cm', min: 0.1, max: 30, decimals: 1 },
    {
      key: 'exophytic',
      type: 'choice',
      options: ['atLeastHalf', 'lessThanHalf', 'endophytic'],
      set: 'exophytic',
    },
    { key: 'nearness', type: 'number', unit: 'mm', min: 0, max: 100, decimals: 1 },
    { key: 'face', type: 'choice', options: ['a', 'p', 'x'], set: 'face' },
    { key: 'location', type: 'choice', options: ['beyond', 'crosses', 'within'], set: 'location' },
    { key: 'hilar', type: 'choice', options: ['no', 'yes'], set: 'yesNo' },
  ],
  compute(values) {
    const diameter = num(values, 'diameter');
    const nearness = num(values, 'nearness');
    const r = diameter <= 4 ? 1 : diameter < 7 ? 2 : 3;
    const e = points(
      { atLeastHalf: 1, lessThanHalf: 2, endophytic: 3 },
      choice(values, 'exophytic'),
    );
    const n = nearness >= 7 ? 1 : nearness > 4 ? 2 : 3;
    const l = points({ beyond: 1, crosses: 2, within: 3 }, choice(values, 'location'));
    const total = r + e + n + l;
    const suffix = `${choice(values, 'face')}${choice(values, 'hilar') === 'yes' ? 'h' : ''}`;
    return {
      value: total,
      decimals: 0,
      unit: 'points',
      label: `${total}${suffix}`,
      band: total <= 6 ? 'low' : total <= 9 ? 'moderate' : 'high',
      parts: [
        { key: 'r', value: r },
        { key: 'e', value: e },
        { key: 'n', value: n },
        { key: 'l', value: l },
      ],
    };
  },
  reference: {
    citation:
      'Kutikov A, Uzzo RG. The R.E.N.A.L. nephrometry score: a comprehensive standardized system for quantitating renal tumor size, location and depth. J Urol. 2009;182(3):844-53.',
    doi: '10.1016/j.juro.2009.05.035',
  },
  review: null,
};

/** The PADUA score of a renal tumour: six parts, 6 to 14 points, and the face it lies on. */
export const padua: Calculator = {
  id: 'padua',
  kind: 'score',
  fields: [
    { key: 'longitudinal', type: 'choice', options: ['polar', 'middle'], set: 'longitudinal' },
    {
      key: 'exophytic',
      type: 'choice',
      options: ['atLeastHalf', 'lessThanHalf', 'endophytic'],
      set: 'exophytic',
    },
    { key: 'rim', type: 'choice', options: ['lateral', 'medial'], set: 'rim' },
    { key: 'sinus', type: 'choice', options: ['no', 'yes'], set: 'yesNo' },
    { key: 'collecting', type: 'choice', options: ['no', 'yes'], set: 'yesNo' },
    { key: 'size', type: 'number', unit: 'cm', min: 0.1, max: 30, decimals: 1 },
    { key: 'face', type: 'choice', options: ['a', 'p'], set: 'face' },
  ],
  compute(values) {
    const size = num(values, 'size');
    const parts = {
      longitudinal: points({ polar: 1, middle: 2 }, choice(values, 'longitudinal')),
      exophytic: points(
        { atLeastHalf: 1, lessThanHalf: 2, endophytic: 3 },
        choice(values, 'exophytic'),
      ),
      rim: points({ lateral: 1, medial: 2 }, choice(values, 'rim')),
      sinus: points({ no: 1, yes: 2 }, choice(values, 'sinus')),
      collecting: points({ no: 1, yes: 2 }, choice(values, 'collecting')),
      size: size <= 4 ? 1 : size <= 7 ? 2 : 3,
    };
    const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return {
      value: total,
      decimals: 0,
      unit: 'points',
      label: `${total}${choice(values, 'face')}`,
      band: total <= 7 ? 'low' : total <= 9 ? 'intermediate' : 'high',
      parts: Object.entries(parts).map(([key, value]) => ({ key, value })),
    };
  },
  reference: {
    citation:
      'Ficarra V, Novara G, Secco S, et al. Preoperative aspects and dimensions used for an anatomical (PADUA) classification of renal tumours in patients who are candidates for nephron-sparing surgery. Eur Urol. 2009;56(5):786-93.',
    doi: '10.1016/j.eururo.2009.07.040',
  },
  review: null,
};

/**
 * The S.T.O.N.E. nephrolithometry score before percutaneous nephrolithotomy: stone size, tract
 * length, obstruction, number of calyces and essence (density), 4 to 12 points.
 */
export const stone: Calculator = {
  id: 'stone',
  kind: 'score',
  fields: [
    { key: 'area', type: 'number', unit: 'mm2', min: 1, max: 20000, decimals: 0 },
    { key: 'tract', type: 'number', unit: 'mm', min: 1, max: 400, decimals: 0 },
    {
      key: 'obstruction',
      type: 'choice',
      options: ['noneOrMild', 'moderateOrSevere'],
      set: 'obstruction',
    },
    { key: 'calyces', type: 'choice', options: ['oneOrTwo', 'three', 'staghorn'], set: 'calyces' },
    { key: 'density', type: 'number', unit: 'hu', min: 0, max: 3000, decimals: 0 },
  ],
  compute(values) {
    const area = num(values, 'area');
    const parts = {
      s: area < 400 ? 1 : area < 800 ? 2 : area < 1600 ? 3 : 4,
      t: num(values, 'tract') <= 100 ? 1 : 2,
      o: points({ noneOrMild: 0, moderateOrSevere: 1 }, choice(values, 'obstruction')),
      n: points({ oneOrTwo: 1, three: 2, staghorn: 3 }, choice(values, 'calyces')),
      e: num(values, 'density') <= 950 ? 1 : 2,
    };
    const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return {
      value: total,
      decimals: 0,
      unit: 'points',
      band: total <= 5 ? 'low' : total <= 8 ? 'moderate' : 'high',
      parts: Object.entries(parts).map(([key, value]) => ({ key, value })),
    };
  },
  reference: {
    citation:
      'Okhunov Z, Friedlander JI, George AK, et al. S.T.O.N.E. nephrolithometry: novel surgical classification system for kidney calculi. Urology. 2013;81(6):1154-9.',
    doi: '10.1016/j.urology.2012.10.083',
  },
  review: null,
};
