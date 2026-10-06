import { describe, expect, it } from 'vitest';
import { changedFields, groupSecret, textOrNull, toggle } from './account-model';

describe('the profile form', () => {
  it('ticks and unticks a choice', () => {
    expect(toggle(['he'], 'en')).toEqual(['he', 'en']);
    expect(toggle(['he', 'en'], 'he')).toEqual(['en']);
  });

  it('reads an empty box as nothing', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' Dr. ')).toBe('Dr.');
  });

  it('sends only what was changed', () => {
    const before = {
      firstName: 'Noa',
      title: null as string | null,
      languages: ['he', 'en'],
      visibility: { NAME: 'MEMBERS', BIO: 'PRIVATE' },
    };
    expect(changedFields(before, { ...before })).toEqual({});
    expect(changedFields(before, { ...before, languages: ['en', 'he'] })).toEqual({});
    expect(
      changedFields(before, {
        ...before,
        title: 'Dr.',
        languages: ['he'],
        visibility: { NAME: 'MEMBERS', BIO: 'PUBLIC' },
      }),
    ).toEqual({ title: 'Dr.', languages: ['he'], visibility: { NAME: 'MEMBERS', BIO: 'PUBLIC' } });
  });
});

describe('an authenticator’s key', () => {
  it('is written in groups of four', () => {
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
    expect(groupSecret('ABCD EFGH')).toBe('ABCD EFGH');
  });
});
