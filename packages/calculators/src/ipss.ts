import { choice } from './evaluate';
import type { Calculator, ChoiceField } from './types';

const often = ['0', '1', '2', '3', '4', '5'] as const;

const question = (key: string, set = 'often'): ChoiceField => ({
  key,
  type: 'choice',
  options: often,
  set,
});

/** Questions 1, 3, 5 and 6 ask about voiding; 2, 4 and 7 about storage. */
const VOIDING = ['emptying', 'intermittency', 'weakStream', 'straining'] as const;
const STORAGE = ['frequency', 'urgency', 'nocturia'] as const;

/**
 * The International Prostate Symptom Score: the seven questions of the AUA symptom index, 0 to 5
 * points each, and the question on quality of life, 0 to 6, which is reported apart.
 */
export const ipss: Calculator = {
  id: 'ipss',
  kind: 'questionnaire',
  fields: [
    question('emptying'),
    question('frequency'),
    question('intermittency'),
    question('urgency'),
    question('weakStream'),
    question('straining'),
    question('nocturia', 'nocturia'),
    { key: 'qol', type: 'choice', options: ['0', '1', '2', '3', '4', '5', '6'], set: 'qol' },
  ],
  compute(values) {
    const sum = (keys: readonly string[]) =>
      keys.reduce((total, key) => total + Number(choice(values, key)), 0);
    const total = sum(VOIDING) + sum(STORAGE);
    return {
      value: total,
      decimals: 0,
      unit: 'points',
      band: total <= 7 ? 'mild' : total <= 19 ? 'moderate' : 'severe',
      parts: [
        { key: 'voiding', value: sum(VOIDING) },
        { key: 'storage', value: sum(STORAGE) },
        { key: 'qol', value: Number(choice(values, 'qol')) },
      ],
    };
  },
  reference: {
    citation:
      'Barry MJ, Fowler FJ Jr, O’Leary MP, et al. The American Urological Association symptom index for benign prostatic hyperplasia. J Urol. 1992;148(5):1549-57.',
    doi: '10.1016/s0022-5347(17)36966-5',
  },
  review: null,
  hebrewNotValidated: true,
};
