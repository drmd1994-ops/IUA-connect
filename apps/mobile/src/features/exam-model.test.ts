import { describe, expect, it } from 'vitest';
import { countAnswer, hostOf, optionMarks, savedNote, stateAfterNext } from './exam-model';

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
