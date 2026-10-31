import { describe, expect, it } from 'vitest';
import { parseScan, safeFileName } from './scan-model';

describe('a scanned code', () => {
  it('reads the venue’s code of an event, in either language', () => {
    expect(parseScan('https://iua.example.test/he/events/annual-2030/check-in?t=abc.def')).toEqual({
      kind: 'checkIn',
      slug: 'annual-2030',
      token: 'abc.def',
    });
    expect(parseScan('http://10.0.0.4:3001/en/events/%D7%9B%D7%A0%D7%A1/check-in?t=x&y=1')).toEqual(
      { kind: 'checkIn', slug: 'כנס', token: 'x' },
    );
  });

  it('reads the code of a membership card', () => {
    expect(parseScan(' https://iua.example.test/en/card/verify?t=tok%2Fen ')).toEqual({
      kind: 'card',
      token: 'tok/en',
    });
  });

  it('follows nothing else', () => {
    expect(parseScan('https://iua.example.test/he/events/annual-2030/check-in')).toBeNull();
    expect(parseScan('https://iua.example.test/he/admin?t=x')).toBeNull();
    expect(parseScan('https://example.test/')).toBeNull();
    expect(parseScan('WIFI:S:guest;T:WPA;P:secret;;')).toBeNull();
    expect(parseScan('javascript:alert(1)')).toBeNull();
    expect(parseScan('https://iua.example.test/he/events/%E0%A4%A/check-in?t=x')).toBeNull();
  });
});

describe('the name of a saved file', () => {
  it('keeps letters and digits of any language', () => {
    expect(safeFileName('Annual meeting 2030!', 'ics')).toBe('Annual-meeting-2030.ics');
    expect(safeFileName('כנס שנתי', 'ics')).toBe('כנס-שנתי.ics');
    expect(safeFileName('///', 'ics')).toBe('file.ics');
  });
});

describe('the conference guest code', () => {
  it('leads someone signed in to the event', () => {
    expect(parseScan('https://site.example/he/events/demo-conference/join?code=abc')).toEqual({
      kind: 'event',
      slug: 'demo-conference',
    });
  });
});
