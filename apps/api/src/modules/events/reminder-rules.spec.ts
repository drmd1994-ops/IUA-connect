import { dueReminders, reminderWindow } from './reminder-rules';

describe('reminder rules', () => {
  const startAt = new Date('2030-01-10T07:00:00Z');
  const daysBefore = (days: number, hours = 0) =>
    new Date(startAt.getTime() - (days * 24 + hours) * 60 * 60 * 1000);
  const longAgo = daysBefore(60);
  const due = (now: Date, placedAt = longAgo, sent: ('WEEK' | 'DAY')[] = []) =>
    dueReminders({ startAt, placedAt, now, sent });

  it('opens the week reminder 7 days before and the day reminder 1 day before', () => {
    expect(reminderWindow('WEEK', startAt)).toEqual({ from: daysBefore(7), until: daysBefore(1) });
    expect(reminderWindow('DAY', startAt)).toEqual({ from: daysBefore(1), until: startAt });
  });

  it('sends nothing more than a week ahead', () => {
    expect(due(daysBefore(7, 1))).toEqual([]);
  });

  it('sends the week reminder from 7 days before, also late, until a day before', () => {
    expect(due(daysBefore(7))).toEqual(['WEEK']);
    expect(due(daysBefore(3))).toEqual(['WEEK']);
    expect(due(daysBefore(1, 1))).toEqual(['WEEK']);
  });

  it('sends only the day reminder in the last day, and nothing once the event starts', () => {
    expect(due(daysBefore(1))).toEqual(['DAY']);
    expect(due(daysBefore(0, 2))).toEqual(['DAY']);
    expect(due(startAt)).toEqual([]);
    expect(due(new Date(startAt.getTime() + 1000))).toEqual([]);
  });

  it('never sends a reminder twice', () => {
    expect(due(daysBefore(3), longAgo, ['WEEK'])).toEqual([]);
    expect(due(daysBefore(0, 2), longAgo, ['WEEK', 'DAY'])).toEqual([]);
    expect(due(daysBefore(0, 2), longAgo, ['WEEK'])).toEqual(['DAY']);
  });

  it('skips a reminder whose time passed before the person got their place', () => {
    // Registered 5 days before: no week reminder, but the day reminder comes.
    expect(due(daysBefore(4), daysBefore(5))).toEqual([]);
    expect(due(daysBefore(0, 5), daysBefore(5))).toEqual(['DAY']);
    // Registered in the last day: no reminders at all.
    expect(due(daysBefore(0, 2), daysBefore(0, 3))).toEqual([]);
  });
});
