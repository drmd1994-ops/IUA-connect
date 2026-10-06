import { describe, expect, it } from 'vitest';
import { appRoute, changeable, noticeValues } from './notifications-model';

describe('where a notice leads', () => {
  it('opens news and events inside the app', () => {
    expect(appRoute('/news/a-b')).toBe('/news/a-b');
    expect(appRoute('/events/%D7%90?x=1')).toBe('/events/%D7%90');
    expect(appRoute('/events')).toBe('/events');
    expect(appRoute('/account/schedule')).toBe('/events/schedule');
  });

  it('leads nowhere for what the app does not have', () => {
    expect(appRoute(null)).toBeNull();
    expect(appRoute('/education/x')).toBeNull();
    expect(appRoute('/guidelines')).toBeNull();
    expect(appRoute('https://elsewhere.example.test/news/x')).toBeNull();
  });
});

describe('the words of a notice', () => {
  it('reads the title in the reader’s language, or the other one', () => {
    const params = { titleHe: 'כותרת', titleEn: 'Title' };
    expect(noticeValues(params, 'he').title).toBe('כותרת');
    expect(noticeValues(params, 'en').title).toBe('Title');
    expect(noticeValues({ titleEn: 'Only' }, 'he').title).toBe('Only');
    expect(noticeValues({ title: 'Plain' }, 'he').title).toBe('Plain');
    expect(noticeValues({}, 'en').title).toBe('');
  });

  it('keeps only values a sentence can hold', () => {
    expect(noticeValues({ count: 2, nested: { a: 1 }, flag: true }, 'en')).toEqual({
      count: 2,
      title: '',
    });
  });
});

describe('saving the switches', () => {
  it('sends only the kinds the person may change', () => {
    expect(
      changeable([
        { kind: 'NEWS', app: true, email: false, locked: false },
        { kind: 'SECURITY', app: true, email: true, locked: true },
      ]),
    ).toEqual([{ kind: 'NEWS', app: true, email: false }]);
  });
});
