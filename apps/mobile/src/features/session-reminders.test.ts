import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-notifications', () => ({}));

const { remindersToSchedule } = await import('./session-reminders');

const session = (id: string, startAt: string) => ({ id, title: id, room: null, startAt });

describe('remindersToSchedule', () => {
  const now = new Date('2026-11-30T09:00:00Z');

  it('sets each reminder ten minutes before its session', () => {
    const [first] = remindersToSchedule([session('a', '2026-11-30T10:00:00Z')], now);
    expect(first?.at).toEqual(new Date('2026-11-30T09:50:00Z'));
  });

  it('leaves out a reminder whose time has passed', () => {
    const list = remindersToSchedule(
      [session('over', '2026-11-30T08:00:00Z'), session('soon', '2026-11-30T09:05:00Z')],
      now,
    );
    expect(list).toEqual([]);
  });

  it('keeps the soonest thirty, in order', () => {
    const many = Array.from({ length: 40 }, (_, day) =>
      session(`s${day}`, new Date(Date.UTC(2026, 11, 40 - day, 10)).toISOString()),
    );
    const list = remindersToSchedule(many, now);
    expect(list).toHaveLength(30);
    expect(list[0]?.id).toBe('s39');
    expect(list[29]?.id).toBe('s10');
  });
});
