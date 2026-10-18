import { describe, expect, it } from 'vitest';
import {
  CALCULATORS,
  calculatorById,
  evaluate,
  gfrStage,
  type RawValues,
  type Result,
} from './index';

/** The result of a calculator that must succeed. */
function result(id: string, raw: RawValues): Result {
  const calculator = calculatorById(id);
  if (!calculator) throw new Error(`no calculator ${id}`);
  const outcome = evaluate(calculator, raw);
  if (!outcome.ok) throw new Error(`refused: ${JSON.stringify(outcome.problems)}`);
  return outcome.result;
}

function problems(id: string, raw: RawValues) {
  const outcome = evaluate(calculatorById(id)!, raw);
  return outcome.ok ? [] : outcome.problems;
}

describe('the list', () => {
  it('has the nine of the plan, each with a source and no review yet', () => {
    expect(CALCULATORS.map((c) => c.id)).toEqual([
      'ipss',
      'psaDensity',
      'psaVelocity',
      'creatinineClearance',
      'egfr',
      'stoneVolume',
      'renal',
      'padua',
      'stone',
    ]);
    for (const calculator of CALCULATORS) {
      expect(calculator.reference.doi ?? calculator.reference.url).toBeTruthy();
      // Set only when the owner has signed it (plan §10, answer 1).
      expect(calculator.review).toBeNull();
    }
  });

  it('has no licensed questionnaire or table', () => {
    for (const id of ['iief', 'shim', 'tnm']) expect(calculatorById(id)).toBeUndefined();
  });
});

describe('checking what was typed', () => {
  it('asks for what is missing', () => {
    expect(problems('psaDensity', {})).toEqual([
      { field: 'psa', code: 'required' },
      { field: 'volume', code: 'required' },
    ]);
  });

  it('refuses what is not a number, a sign, or too many decimals', () => {
    for (const psa of ['abc', '-1', '1.234', '1e3', '1.2.3']) {
      expect(problems('psaDensity', { psa, volume: '40' })).toEqual([
        { field: 'psa', code: 'notNumber', decimals: 2 },
      ]);
    }
  });

  it('accepts a decimal comma and spaces', () => {
    expect(result('psaDensity', { psa: ' 6,0 ', volume: '40' }).value).toBe(0.15);
  });

  it('refuses a value outside the range, with the range', () => {
    expect(problems('psaDensity', { psa: '6', volume: '4' })).toEqual([
      { field: 'volume', code: 'outOfRange', min: 5, max: 500, unit: 'ml' },
    ]);
  });

  it('gives no number below the age a formula was made for', () => {
    expect(problems('egfr', { age: '17', sex: 'male', creatinine: '1' })).toEqual([
      { field: 'age', code: 'outOfRange', min: 18, max: 120, unit: 'years' },
    ]);
  });

  it('checks creatinine in the unit chosen', () => {
    const base = { age: '60', sex: 'male' };
    expect(problems('egfr', { ...base, creatinineUnit: 'umoll', creatinine: '2000' })).toEqual([
      { field: 'creatinine', code: 'outOfRange', min: 9, max: 1768, unit: 'umoll' },
    ]);
    expect(problems('egfr', { ...base, creatinineUnit: 'umoll', creatinine: '88.4' })).toEqual([
      { field: 'creatinine', code: 'notNumber', decimals: 0 },
    ]);
    expect(problems('egfr', { ...base, creatinine: '25' })).toEqual([
      { field: 'creatinine', code: 'outOfRange', min: 0.1, max: 20, unit: 'mgdl' },
    ]);
  });

  it('refuses an option that is not one of the answers', () => {
    expect(problems('egfr', { age: '60', sex: 'other', creatinine: '1' })).toEqual([
      { field: 'sex', code: 'required' },
    ]);
  });
});

describe('IPSS', () => {
  const answers = (each: string, qol = '0') => ({
    emptying: each,
    frequency: each,
    intermittency: each,
    urgency: each,
    weakStream: each,
    straining: each,
    nocturia: each,
    qol,
  });

  it('adds the seven questions; quality of life apart', () => {
    const none = result('ipss', answers('0', '6'));
    expect(none.value).toBe(0);
    expect(none.band).toBe('mild');
    expect(none.parts).toEqual([
      { key: 'voiding', value: 0 },
      { key: 'storage', value: 0 },
      { key: 'qol', value: 6 },
    ]);
    const most = result('ipss', answers('5'));
    expect(most.value).toBe(35);
    expect(most.band).toBe('severe');
    expect(most.parts?.slice(0, 2)).toEqual([
      { key: 'voiding', value: 20 },
      { key: 'storage', value: 15 },
    ]);
  });

  it('is mild to 7, moderate from 8 to 19, severe from 20', () => {
    const score = (emptying: string, frequency: string, intermittency: string, urgency: string) =>
      result('ipss', { ...answers('0'), emptying, frequency, intermittency, urgency });
    expect(score('5', '2', '0', '0')).toMatchObject({ value: 7, band: 'mild' });
    expect(score('5', '3', '0', '0')).toMatchObject({ value: 8, band: 'moderate' });
    expect(score('5', '5', '5', '4')).toMatchObject({ value: 19, band: 'moderate' });
    expect(score('5', '5', '5', '5')).toMatchObject({ value: 20, band: 'severe' });
  });

  it('needs every answer', () => {
    const { qol: _qol, ...withoutQol } = answers('1');
    expect(problems('ipss', withoutQol)).toEqual([{ field: 'qol', code: 'required' }]);
  });
});

describe('PSA density and velocity', () => {
  it('divides PSA by the volume', () => {
    expect(result('psaDensity', { psa: '6', volume: '40' })).toMatchObject({
      value: 0.15,
      band: 'atOrAbove',
    });
    expect(result('psaDensity', { psa: '4', volume: '40' })).toMatchObject({
      value: 0.1,
      band: 'below',
    });
  });

  it('reads the band from the value as shown', () => {
    // 5.9 / 40 = 0.1475, shown as 0.15.
    expect(result('psaDensity', { psa: '5.9', volume: '40' })).toMatchObject({
      value: 0.15,
      band: 'atOrAbove',
    });
  });

  it('gives the change per year', () => {
    expect(result('psaVelocity', { first: '4', last: '5', months: '12' })).toMatchObject({
      value: 1,
      band: 'atOrAbove',
      notes: ['short', 'method'],
    });
    expect(result('psaVelocity', { first: '4', last: '5.5', months: '24' })).toMatchObject({
      value: 0.75,
      band: 'atOrAbove',
      notes: ['method'],
    });
    expect(result('psaVelocity', { first: '6', last: '5', months: '18' })).toMatchObject({
      value: -0.67,
      band: 'below',
    });
  });
});

describe('creatinine clearance (Cockcroft-Gault)', () => {
  const man = { age: '60', sex: 'male', weight: '72', creatinine: '1' };

  it('is (140 − age) × weight / (72 × creatinine), 15% less for a woman', () => {
    expect(result('creatinineClearance', man).value).toBe(80);
    expect(result('creatinineClearance', { ...man, sex: 'female' }).value).toBe(68);
    expect(result('creatinineClearance', { ...man, creatinine: '2' }).value).toBe(40);
  });

  it('converts µmol/L', () => {
    expect(
      result('creatinineClearance', { ...man, creatinineUnit: 'umoll', creatinine: '88' }).value,
    ).toBe(80);
  });
});

describe('eGFR (CKD-EPI 2021)', () => {
  // Expected values worked by hand from the published equation (Inker et al., 2021).
  it.each([
    ['male', '60', '1.0', 86, 'g2'],
    ['female', '50', '0.8', 90, 'g1'],
    ['male', '40', '0.7', 119, 'g1'],
    ['female', '70', '1.5', 37, 'g3b'],
    ['male', '80', '3.0', 20, 'g4'],
  ] as const)('%s, %s years, creatinine %s mg/dL → %i', (sex, age, creatinine, expected, stage) => {
    expect(result('egfr', { age, sex, creatinine })).toMatchObject({
      value: expected,
      band: stage,
    });
  });

  it('converts µmol/L at 88.4 per mg/dL', () => {
    // 88 µmol/L is 0.995 mg/dL (1.0 mg/dL gives 86); 884 µmol/L is 10 mg/dL.
    const egfr = (creatinine: string) =>
      result('egfr', { age: '60', sex: 'male', creatinineUnit: 'umoll', creatinine }).value;
    expect(egfr('88')).toBe(87);
    expect(egfr('884')).toBe(result('egfr', { age: '60', sex: 'male', creatinine: '10' }).value);
  });

  it('stages by KDIGO', () => {
    expect([90, 89, 60, 59, 45, 44, 30, 29, 15, 14].map(gfrStage)).toEqual([
      'g1',
      'g2',
      'g2',
      'g3a',
      'g3a',
      'g3b',
      'g3b',
      'g4',
      'g4',
      'g5',
    ]);
  });
});

describe('stone volume', () => {
  it('is π/6 × the three diameters, with the area π/4 × length × width', () => {
    expect(result('stoneVolume', { length: '10', width: '10', depth: '10' })).toMatchObject({
      value: 524,
      parts: [{ key: 'area', value: 79, unit: 'mm2', decimals: 0 }],
    });
    expect(result('stoneVolume', { length: '20', width: '15', depth: '12' }).value).toBe(1885);
  });
});

describe('R.E.N.A.L.', () => {
  const mass = {
    diameter: '3.5',
    exophytic: 'lessThanHalf',
    nearness: '5',
    face: 'p',
    location: 'crosses',
    hilar: 'no',
  };

  it('adds the four parts and writes the letters after', () => {
    expect(result('renal', mass)).toMatchObject({ value: 7, label: '7p', band: 'moderate' });
    expect(result('renal', { ...mass, hilar: 'yes', face: 'x' }).label).toBe('7xh');
  });

  it('scores the edges of size and nearness as the paper does', () => {
    const r = (diameter: string) => result('renal', { ...mass, diameter }).parts?.[0]?.value;
    expect([r('4'), r('4.1'), r('6.9'), r('7')]).toEqual([1, 2, 2, 3]);
    const n = (nearness: string) => result('renal', { ...mass, nearness }).parts?.[2]?.value;
    expect([n('7'), n('6.9'), n('4.1'), n('4'), n('0')]).toEqual([1, 2, 2, 3, 3]);
  });

  it('is low to 6, moderate to 9, high from 10', () => {
    const smallest = {
      ...mass,
      diameter: '2',
      exophytic: 'atLeastHalf',
      nearness: '10',
      location: 'beyond',
    };
    expect(result('renal', smallest)).toMatchObject({ value: 4, band: 'low' });
    const largest = {
      ...mass,
      diameter: '8',
      exophytic: 'endophytic',
      nearness: '2',
      location: 'within',
    };
    expect(result('renal', largest)).toMatchObject({ value: 12, band: 'high' });
  });
});

describe('PADUA', () => {
  const tumour = {
    longitudinal: 'polar',
    exophytic: 'atLeastHalf',
    rim: 'lateral',
    sinus: 'no',
    collecting: 'no',
    size: '3',
    face: 'a',
  };

  it('is 6 to 14 with the face after', () => {
    expect(result('padua', tumour)).toMatchObject({ value: 6, label: '6a', band: 'low' });
    const most = {
      longitudinal: 'middle',
      exophytic: 'endophytic',
      rim: 'medial',
      sinus: 'yes',
      collecting: 'yes',
      size: '7.5',
      face: 'p',
    };
    expect(result('padua', most)).toMatchObject({ value: 14, label: '14p', band: 'high' });
  });

  it('scores size up to 4 cm, 4.1 to 7, above 7', () => {
    const size = (value: string) => result('padua', { ...tumour, size: value }).value - 5;
    expect([size('4'), size('4.1'), size('7'), size('7.1')]).toEqual([1, 2, 2, 3]);
  });

  it('is low at 6–7, intermediate at 8–9, high from 10', () => {
    const band = (extra: Record<string, string>) => result('padua', { ...tumour, ...extra }).band;
    expect(band({ rim: 'medial' })).toBe('low');
    expect(band({ rim: 'medial', sinus: 'yes' })).toBe('intermediate');
    expect(band({ rim: 'medial', sinus: 'yes', collecting: 'yes' })).toBe('intermediate');
    expect(band({ rim: 'medial', sinus: 'yes', collecting: 'yes', longitudinal: 'middle' })).toBe(
      'high',
    );
  });
});

describe('S.T.O.N.E.', () => {
  const kidney = {
    area: '300',
    tract: '80',
    obstruction: 'noneOrMild',
    calyces: 'oneOrTwo',
    density: '900',
  };

  it('is 4 at its least and 12 at its most', () => {
    expect(result('stone', kidney)).toMatchObject({ value: 4, band: 'low' });
    const most = {
      area: '2000',
      tract: '120',
      obstruction: 'moderateOrSevere',
      calyces: 'staghorn',
      density: '1200',
    };
    expect(result('stone', most)).toMatchObject({ value: 12, band: 'high' });
  });

  it('scores the edges of each part', () => {
    const s = (area: string) => result('stone', { ...kidney, area }).parts?.[0]?.value;
    expect([s('399'), s('400'), s('799'), s('800'), s('1599'), s('1600')]).toEqual([
      1, 2, 2, 3, 3, 4,
    ]);
    expect(result('stone', { ...kidney, tract: '100' }).parts?.[1]?.value).toBe(1);
    expect(result('stone', { ...kidney, tract: '101' }).parts?.[1]?.value).toBe(2);
    expect(result('stone', { ...kidney, density: '950' }).parts?.[4]?.value).toBe(1);
    expect(result('stone', { ...kidney, density: '951' }).parts?.[4]?.value).toBe(2);
  });
});
