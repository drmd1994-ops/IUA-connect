import { isValidOrcid } from './orcid';

describe('isValidOrcid', () => {
  it('accepts iDs with a correct check character', () => {
    // Examples from ORCID's own documentation.
    expect(isValidOrcid('0000-0002-1825-0097')).toBe(true);
    expect(isValidOrcid('0000-0001-5109-3700')).toBe(true);
    expect(isValidOrcid('0000-0002-1694-233X')).toBe(true);
  });

  it('rejects a wrong check character or a malformed value', () => {
    expect(isValidOrcid('0000-0002-1825-0098')).toBe(false);
    expect(isValidOrcid('0000000218250097')).toBe(false);
    expect(isValidOrcid('0000-0002-1825-009')).toBe(false);
    expect(isValidOrcid('0000-0002-1694-233x')).toBe(false);
    expect(isValidOrcid('')).toBe(false);
  });
});
