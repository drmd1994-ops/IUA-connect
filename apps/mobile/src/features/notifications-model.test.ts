import { describe, expect, it } from 'vitest';
import { appRoute, changeable, noticeValues } from './notifications-model';

describe('where a notice leads', () => {
  it('opens news and events inside the app', () => {
    expect(appRoute('/news/a-b')).toBe('/news/a-b');
    expect(appRoute('/events/%D7%90?x=1')).toBe('/events/%D7%90');
    expect(appRoute('/events')).toBe('/events');
    expect(appRoute('/account/schedule')).toBe('/events/schedule');
  });

  it('opens education, guidelines, members and messages inside the app', () => {
    expect(appRoute('/education/a-b')).toBe('/education/a-b');
    expect(appRoute('/education/exam')).toBe('/exam');
    expect(appRoute('/guidelines/123')).toBe('/guidelines/123');
    expect(appRoute('/members/abc')).toBe('/members/abc');
    expect(appRoute('/account/notifications/messages/m1')).toBe('/broadcast/m1');
    expect(appRoute('/account/security')).toBe('/security');
  });

  it('opens positions and mentorship inside the app (M28)', () => {
    expect(appRoute('/positions/p1')).toBe('/positions/p1');
    expect(appRoute('/positions/saved')).toBe('/positions/saved');
    expect(appRoute('/mentorship')).toBe('/mentorship');
    expect(appRoute('/mentorship/requests')).toBe('/mentorship/requests');
    expect(appRoute('/admin/positions/p1')).toBeNull();
    expect(appRoute('/communities/following')).toBe('/communities');
    expect(appRoute('/communities/andrology')).toBe('/communities/andrology');
    expect(appRoute('/communities/andrology/po-1')).toBe('/communities/andrology/po-1');
  });

  it('opens research projects and requests inside the app (M27)', () => {
    expect(appRoute('/research')).toBe('/research');
    expect(appRoute('/research/requests')).toBe('/research/requests');
    expect(appRoute('/research/rp-1')).toBe('/research/rp-1');
    expect(appRoute('/research/rp-1/edit')).toBeNull();
  });

  it('opens the journal club inside the app (M31)', () => {
    expect(appRoute('/journal-club')).toBe('/journal-club');
    expect(appRoute('/journal-club/jc-1')).toBe('/journal-club/jc-1');
    expect(appRoute('/admin/journal-club/jc-1')).toBeNull();
  });

  it('leads nowhere for what the app does not have', () => {
    expect(appRoute(null)).toBeNull();
    expect(appRoute('/admin/news')).toBeNull();
    expect(appRoute('/organisations/some-org/news')).toBeNull();
    expect(appRoute('/account/applications')).toBe('/applications');
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
