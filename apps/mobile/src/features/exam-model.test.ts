import { describe, expect, it } from 'vitest';
import {
  clock,
  countAnswer,
  dueWarning,
  hostOf,
  optionMarks,
  percent,
  savedNote,
  stateAfterNext,
} from './exam-model';

describe('exam practice', () => {
  it('asks while there is a question', () => {
    expect(stateAfterNext(true, 0)).toBe('asking');
    expect(stateAfterNext(true, 4)).toBe('asking');
  });

  it('tells "none for these filters" from "you answered them all"', () => {
    expect(stateAfterNext(false, 0)).toBe('none');
    expect(stateAfterNext(false, 3)).toBe('done');
  });

  it('counts the visit', () => {
    const one = countAnswer({ answered: 0, correct: 0 }, true);
    expect(countAnswer(one, false)).toEqual({ answered: 2, correct: 1 });
  });

  it('says whether the answer was saved, and whether it counts', () => {
    expect(savedNote({ saved: false, countsForScore: false })).toBeNull();
    expect(savedNote({ saved: true, countsForScore: true })).toBe('savedNote');
    expect(savedNote({ saved: true, countsForScore: false })).toBe('repeatNote');
  });

  it('marks the right option and the reader’s own', () => {
    expect(optionMarks({ position: 2, correct: true }, 2)).toEqual({
      right: true,
      yours: true,
      why: 'whyRight',
    });
    expect(optionMarks({ position: 1, correct: false }, 2)).toEqual({
      right: false,
      yours: false,
      why: 'whyWrong',
    });
  });
});

describe('the place a link leads to', () => {
  it('is named without "www"', () => {
    expect(hostOf('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(hostOf('https://player.vimeo.com:443/video/1')).toBe('player.vimeo.com');
    expect(hostOf('not a link')).toBe('not a link');
  });
});

describe('the mock exam', () => {
  it('shows the time left as minutes and seconds, never below zero', () => {
    expect(clock(15 * 60_000)).toBe('15:00');
    expect(clock(61_500)).toBe('1:02');
    expect(clock(-3000)).toBe('0:00');
  });

  it('scores as a share of every question', () => {
    expect(percent(7, 10)).toBe(70);
    expect(percent(0, 0)).toBe(0);
  });

  it('warns at five minutes and at one minute, once each', () => {
    const given = new Set<number>();
    expect(dueWarning(6 * 60_000, given)).toBeNull();
    expect(dueWarning(5 * 60_000, given)).toBe(5);
    given.add(5);
    expect(dueWarning(4 * 60_000, given)).toBeNull();
    expect(dueWarning(60_000, given)).toBe(1);
    given.add(1);
    expect(dueWarning(30_000, given)).toBeNull();
    // Opened with less than a minute left: only the one-minute warning.
    expect(dueWarning(40_000, new Set())).toBe(1);
    expect(dueWarning(0, new Set())).toBeNull();
  });
});
