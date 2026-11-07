import {
  feedbackOpen,
  firstQuestionStatus,
  guestEntryOpen,
  isDemoServer,
  questionsOpen,
  sessionReminderDue,
  shiftedFromNow,
  showsResults,
} from './conference-rules';

const at = (time: string) => new Date(`2026-11-30T${time}:00Z`);
const session = { startAt: at('10:00'), endAt: at('11:00') };

describe('questionsOpen', () => {
  it('opens 15 minutes before and closes 30 minutes after', () => {
    expect(questionsOpen(session, at('09:44'))).toBe(false);
    expect(questionsOpen(session, at('09:45'))).toBe(true);
    expect(questionsOpen(session, at('11:30'))).toBe(true);
    expect(questionsOpen(session, at('11:31'))).toBe(false);
  });
});

describe('feedbackOpen', () => {
  it('opens when the session starts and stays open for a week after', () => {
    expect(feedbackOpen(session, at('09:59'))).toBe(false);
    expect(feedbackOpen(session, at('10:00'))).toBe(true);
    expect(feedbackOpen(session, new Date('2026-12-07T11:00:00Z'))).toBe(true);
    expect(feedbackOpen(session, new Date('2026-12-07T11:01:00Z'))).toBe(false);
  });
});

describe('sessionReminderDue', () => {
  it('is due from ten minutes before until the session starts', () => {
    expect(sessionReminderDue(session.startAt, at('09:49'))).toBe(false);
    expect(sessionReminderDue(session.startAt, at('09:50'))).toBe(true);
    expect(sessionReminderDue(session.startAt, at('09:59'))).toBe(true);
    expect(sessionReminderDue(session.startAt, at('10:00'))).toBe(false);
  });
});

describe('showsResults', () => {
  it('hides results from someone who has not voted while the poll is open', () => {
    expect(showsResults({ status: 'OPEN', voted: false, canChair: false })).toBe(false);
  });

  it('shows them after voting, once closed, and always to a chair', () => {
    expect(showsResults({ status: 'OPEN', voted: true, canChair: false })).toBe(true);
    expect(showsResults({ status: 'CLOSED', voted: false, canChair: false })).toBe(true);
    expect(showsResults({ status: 'OPEN', voted: false, canChair: true })).toBe(true);
  });
});

describe('firstQuestionStatus', () => {
  it('waits for a moderator unless moderation is off', () => {
    expect(firstQuestionStatus(true)).toBe('PENDING');
    expect(firstQuestionStatus(false)).toBe('VISIBLE');
  });
});

describe('guestEntryOpen', () => {
  const open = {
    status: 'PUBLISHED',
    guestCode: 'code',
    guestEntryFrom: at('08:00'),
    guestEntryUntil: at('20:00'),
  };

  it('is open on a demo inside the time', () => {
    expect(guestEntryOpen(open, true, at('12:00'))).toBe(true);
  });

  it('is closed in real production, whatever the event says', () => {
    expect(guestEntryOpen(open, false, at('12:00'))).toBe(false);
  });

  it('is closed outside the time, without a code, and for an unpublished event', () => {
    expect(guestEntryOpen(open, true, at('07:59'))).toBe(false);
    expect(guestEntryOpen(open, true, at('20:01'))).toBe(false);
    expect(guestEntryOpen({ ...open, guestCode: null }, true, at('12:00'))).toBe(false);
    expect(guestEntryOpen({ ...open, guestEntryFrom: null }, true, at('12:00'))).toBe(false);
    expect(guestEntryOpen({ ...open, status: 'CANCELLED' }, true, at('12:00'))).toBe(false);
  });
});

describe('isDemoServer', () => {
  it('is false only in production without the hosted demo', () => {
    expect(isDemoServer({ NODE_ENV: 'development' })).toBe(true);
    expect(isDemoServer({ NODE_ENV: 'production', DEMO_HOSTED: true })).toBe(true);
    expect(isDemoServer({ NODE_ENV: 'production', DEMO_HOSTED: false })).toBe(false);
    expect(isDemoServer({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('shiftedFromNow', () => {
  it('starts the first session ten minutes ago and keeps the rest in step', () => {
    const shifted = shiftedFromNow(
      [
        { id: 'b', startAt: at('12:00'), endAt: at('12:30') },
        { id: 'a', startAt: at('10:00'), endAt: at('11:00') },
      ],
      new Date('2026-12-01T09:00:00Z'),
    );
    expect(shifted[1]!.startAt).toEqual(new Date('2026-12-01T08:50:00Z'));
    expect(shifted[1]!.endAt).toEqual(new Date('2026-12-01T09:50:00Z'));
    expect(shifted[0]!.startAt).toEqual(new Date('2026-12-01T10:50:00Z'));
    expect(shifted[0]!.endAt).toEqual(new Date('2026-12-01T11:20:00Z'));
  });
});
