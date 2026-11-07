import { describe, expect, it } from 'vitest';
import {
  type LiveQuestion,
  askAgainDelay,
  eventRunning,
  nowAndNext,
  parseConferenceEvent,
  questionsInOrder,
  votePercent,
} from './conference-model';

const at = (time: string) => `2026-11-30T${time}:00.000Z`;
const session = (id: string, start: string, end: string) => ({
  id,
  startAt: at(start),
  endAt: at(end),
});
const when = (time: string) => new Date(at(time));

describe('nowAndNext', () => {
  const sessions = [
    session('morning', '08:00', '09:00'),
    session('room-b', '10:00', '11:00'),
    session('room-a', '10:00', '11:00'),
    session('late', '12:00', '13:00'),
  ];

  it('finds what is on, in every room', () => {
    const { now, next } = nowAndNext(sessions, when('10:30'));
    expect(now.map((s) => s.id)).toEqual(['room-b', 'room-a']);
    expect(next.map((s) => s.id)).toEqual(['late']);
  });

  it('gives every session of the earliest start still to come', () => {
    const { now, next } = nowAndNext(sessions, when('09:30'));
    expect(now).toEqual([]);
    expect(next.map((s) => s.id)).toEqual(['room-b', 'room-a']);
  });

  it('counts a session as over when it ends, and on when it starts', () => {
    expect(nowAndNext(sessions, when('09:00')).now).toEqual([]);
    expect(nowAndNext(sessions, when('08:00')).now.map((s) => s.id)).toEqual(['morning']);
  });

  it('has nothing next after the last session', () => {
    expect(nowAndNext(sessions, when('14:00'))).toEqual({ now: [], next: [] });
  });
});

describe('eventRunning', () => {
  const event = { startAt: at('08:00'), endAt: at('13:00') };

  it('is true from the start until the end', () => {
    expect(eventRunning(event, when('07:59'))).toBe(false);
    expect(eventRunning(event, when('08:00'))).toBe(true);
    expect(eventRunning(event, when('13:00'))).toBe(false);
  });
});

describe('votePercent', () => {
  it('gives a whole percent, and nothing without results', () => {
    expect(votePercent(1, 3)).toBe(33);
    expect(votePercent(0, 3)).toBe(0);
    expect(votePercent(null, null)).toBe(0);
    expect(votePercent(2, 0)).toBe(0);
  });
});

describe('askAgainDelay', () => {
  it('spreads a hall over a second and a half', () => {
    expect(askAgainDelay(() => 0)).toBe(0);
    expect(askAgainDelay(() => 0.999)).toBeLessThan(1500);
  });
});

describe('parseConferenceEvent', () => {
  it('reads the events of the stream', () => {
    expect(parseConferenceEvent('data: {"type":"polls","sessionId":"s"}')).toEqual({
      type: 'polls',
      sessionId: 's',
    });
    expect(parseConferenceEvent('data: {"type":"schedule"}')).toEqual({ type: 'schedule' });
    expect(parseConferenceEvent('data: {"type":"ping"}')).toEqual({ type: 'ping' });
  });

  it('ignores anything else', () => {
    expect(parseConferenceEvent('data: {"type":"polls"}')).toBeNull();
    expect(parseConferenceEvent('data: not json')).toBeNull();
    expect(parseConferenceEvent(': a comment')).toBeNull();
    expect(parseConferenceEvent('data: {"type":"other","sessionId":"s"}')).toBeNull();
  });
});

describe('questionsInOrder', () => {
  const question = (id: string, status: LiveQuestion['status'], upvotes: number) =>
    ({ id, status, upvotes }) as LiveQuestion;

  it('puts what waits first, then the most wanted, then what was answered', () => {
    const ordered = questionsInOrder([
      question('answered', 'ANSWERED', 9),
      question('few', 'VISIBLE', 1),
      question('hidden', 'HIDDEN', 9),
      question('many', 'VISIBLE', 5),
      question('waiting', 'PENDING', 0),
    ]);
    expect(ordered.map((q) => q.id)).toEqual(['waiting', 'many', 'few', 'answered', 'hidden']);
  });
});
