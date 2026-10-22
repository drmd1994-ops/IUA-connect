import { fireEvent, screen } from '@testing-library/react-native';
import { allText, draw, settle } from '@/testing/draw';
import { everything } from '@/testing/fixtures';
import { type Answer, callsTo, world } from '@/testing/world';
import { ExamPractice } from './education';
import { MockExamSitting, MockExamStart } from './question-bank';

const EXAM = '/api/v1/me/mock-exams/mx-1';

describe('the mock exam in the app', () => {
  it('starts an exam with the chosen length and topics', async () => {
    world.routes = {
      ...everything,
      'POST /api/v1/me/mock-exams': () => everything[`GET ${EXAM}`],
    } as Record<string, Answer>;
    await draw(<MockExamStart />);
    await fireEvent.press(screen.getByLabelText('25 questions (37.5 minutes)'));
    await fireEvent.press(screen.getByLabelText('Start the exam'));
    await settle();
    expect(callsTo('POST', '/api/v1/me/mock-exams')[0]?.body).toEqual({
      size: 25,
      subspecialties: [],
    });
  });

  it('follows the server’s clock, saves each answer, and shows the review at the end', async () => {
    const finished = everything['GET /api/v1/me/mock-exams/mx-2'];
    world.routes = {
      ...everything,
      [`PUT ${EXAM}/answers/1`]: () => undefined,
      [`POST ${EXAM}/finish`]: () => finished,
    } as Record<string, Answer>;
    const drawn = await draw(<MockExamSitting id="mx-1" />);
    // Two minutes left by the server's clock, whatever this phone's clock says.
    expect(allText(drawn)).toContain('2:00');
    expect(allText(drawn)).not.toContain('The right answer');

    await fireEvent.press(screen.getByLabelText('Option 1'));
    await settle();
    expect(callsTo('PUT', `${EXAM}/answers/1`)[0]?.body).toEqual({ position: 1 });

    await fireEvent.press(screen.getByLabelText('Finish'));
    expect(allText(drawn)).toContain('One question is unanswered.');
    await fireEvent.press(screen.getByLabelText('End the exam'));
    await settle();
    expect(callsTo('POST', `${EXAM}/finish`)).toHaveLength(1);
    expect(allText(drawn)).toContain('Your result');
    expect(allText(drawn)).toContain('1 of 2 right (50%)');
    expect(allText(drawn)).toContain('The right answer');
    expect(allText(drawn)).toContain('Reviewed by Dr. Fictional');
  });
});

describe('practice in the app', () => {
  it('says how many recent right answers are left out, bookmarks, and reports a question', async () => {
    const id = 'q-1';
    world.routes = {
      ...everything,
      [`PUT /api/v1/me/exam-bookmarks/${id}`]: () => undefined,
      [`POST /api/v1/exam-questions/${id}/answer`]: {
        correct: false,
        chosenPosition: 2,
        correctPosition: 1,
        options: [
          { position: 1, text: 'First option', correct: true, explanation: 'Right because.' },
          { position: 2, text: 'Second option', correct: false, explanation: 'Wrong because.' },
        ],
        summary: 'A summary.',
        references: [{ title: 'A made-up guideline, 2025' }],
        reviewer: null,
        bookmarked: true,
        saved: true,
        countsForScore: true,
      },
      [`POST /api/v1/exam-questions/${id}/reports`]: { id: 'rep-2' },
    } as Record<string, Answer>;
    const drawn = await draw(<ExamPractice />);
    expect(allText(drawn)).toContain(
      'One question you answered right in the last 30 days is left out.',
    );
    expect(allText(drawn)).toContain('Question · Medium');

    await fireEvent.press(screen.getByLabelText('Bookmark this question'));
    await settle();
    expect(callsTo('PUT', `/api/v1/me/exam-bookmarks/${id}`)).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Second option'));
    await fireEvent.press(screen.getByLabelText('Check my answer'));
    await settle();
    expect(allText(drawn)).toContain('A made-up guideline, 2025');

    await fireEvent.press(screen.getByLabelText('Something wrong with this question?'));
    await fireEvent.press(screen.getByLabelText('The question or an option is unclear'));
    await fireEvent.press(screen.getByLabelText('Send to the reviewers'));
    await settle();
    expect(callsTo('POST', `/api/v1/exam-questions/${id}/reports`)[0]?.body).toEqual({
      reason: 'UNCLEAR',
      text: '',
    });
    expect(allText(drawn)).toContain('Thank you. The reviewers will look at it');
  });
});
