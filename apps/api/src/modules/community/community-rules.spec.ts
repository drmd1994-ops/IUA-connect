import { AppException } from '../../common/errors/app.exception';
import {
  COMMENT_EDIT_WINDOW_MS,
  POST_EDIT_WINDOW_MS,
  banInForce,
  refusePatientDetails,
  withinWindow,
} from './community-rules';

describe('community rules', () => {
  it('refuses text with a patient’s details, saying what and where', () => {
    try {
      refusePatientDetails({
        title: 'Stone in a 54-year-old',
        body: 'MRN 4471923, call 052-1234567',
      });
      throw new Error('not refused');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).details).toEqual([
        { field: 'body', code: 'patientRecordNumber', value: 'MRN 4471923' },
        { field: 'body', code: 'patientPhone', value: '052-1234567' },
      ]);
    }
  });

  it('lets ordinary text through', () => {
    expect(() =>
      refusePatientDetails({ title: 'PSA 12 at 67', body: 'Gleason 4+3, seen in 2026.' }),
    ).not.toThrow();
  });

  it('keeps a post editable for a day and a comment for 15 minutes', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms);
    expect(withinWindow(ago(POST_EDIT_WINDOW_MS - 1000), POST_EDIT_WINDOW_MS, now)).toBe(true);
    expect(withinWindow(ago(POST_EDIT_WINDOW_MS + 1000), POST_EDIT_WINDOW_MS, now)).toBe(false);
    expect(withinWindow(ago(COMMENT_EDIT_WINDOW_MS + 1000), COMMENT_EDIT_WINDOW_MS, now)).toBe(
      false,
    );
  });

  it('knows a ban in force: until lifted, or until its time', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(banInForce(null, now)).toBe(false);
    expect(banInForce({ until: null }, now)).toBe(true);
    expect(banInForce({ until: new Date('2026-10-24T00:00:00Z') }, now)).toBe(true);
    expect(banInForce({ until: new Date('2026-10-22T00:00:00Z') }, now)).toBe(false);
  });
});
