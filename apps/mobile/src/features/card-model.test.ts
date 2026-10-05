import { describe, expect, it } from 'vitest';
import { type KeptCard, parseKeptCard, verifyUrl } from './card-model';

const card: KeptCard = {
  person: 'Noa Bar-Lev',
  typeHe: 'חבר/ה מן המניין',
  typeEn: 'Full member',
  status: 'ACTIVE',
  endDate: '2026-12-31',
  fetchedAt: '2026-10-05T10:00:00.000Z',
};

describe('the kept membership card', () => {
  it('reads back what was kept', () => {
    expect(parseKeptCard(JSON.stringify(card))).toEqual(card);
  });

  it('treats anything else as nothing kept', () => {
    expect(parseKeptCard(null)).toBeNull();
    expect(parseKeptCard('')).toBeNull();
    expect(parseKeptCard('not json')).toBeNull();
    expect(parseKeptCard(JSON.stringify({ ...card, status: 'GOLD' }))).toBeNull();
    expect(parseKeptCard(JSON.stringify({ ...card, person: 5 }))).toBeNull();
    expect(parseKeptCard(JSON.stringify({ ...card, fetchedAt: 'yesterday' }))).toBeNull();
    const { endDate: _endDate, ...partial } = card;
    expect(parseKeptCard(JSON.stringify(partial))).toBeNull();
  });

  it('never keeps a code', () => {
    expect(Object.keys(card)).not.toContain('token');
  });

  it('builds the address a scanner opens', () => {
    expect(verifyUrl('http://192.168.1.20:3001', 'he', 'a b/c')).toBe(
      'http://192.168.1.20:3001/he/card/verify?t=a%20b%2Fc',
    );
  });
});
