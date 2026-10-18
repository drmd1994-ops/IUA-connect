import { creatinineClearance, egfr, psaDensity, psaVelocity, stoneVolume } from './formulas';
import { ipss } from './ipss';
import { padua, renal, stone } from './scores';
import type { Calculator } from './types';

export * from './types';
export { CREATININE_UMOL_PER_MGDL, gfrStage } from './formulas';
export { evaluate, parseNumber, round } from './evaluate';

/**
 * The calculators of the first version (M30 plan §0b), in the order they are listed. IIEF, SHIM
 * and TNM are not here: their owners license them (plan §10, answer 2).
 */
export const CALCULATORS: readonly Calculator[] = [
  ipss,
  psaDensity,
  psaVelocity,
  creatinineClearance,
  egfr,
  stoneVolume,
  renal,
  padua,
  stone,
];

export function calculatorById(id: string): Calculator | undefined {
  return CALCULATORS.find((calculator) => calculator.id === id);
}
