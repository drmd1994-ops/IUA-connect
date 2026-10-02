import { canEdit, paragraphsOf, stepProblem, submitProblem } from './broadcast-rules';

const AUTHOR = 'author';
const OTHER = 'other';
const admin = (userId: string, canApprove = true) => ({ userId, canApprove });

describe('broadcast rules', () => {
  it('lets the author change a draft or a message that was sent back, and nothing else', () => {
    expect(canEdit('DRAFT')).toBe(true);
    expect(canEdit('REJECTED')).toBe(true);
    expect(canEdit('PENDING_APPROVAL')).toBe(false);
    expect(canEdit('SENT')).toBe(false);
  });

  it('only the author submits, from a draft or after it was sent back', () => {
    const draft = { status: 'DRAFT', createdBy: AUTHOR } as const;
    expect(stepProblem('SUBMIT', draft, admin(AUTHOR))).toBeNull();
    expect(stepProblem('SUBMIT', { ...draft, status: 'REJECTED' }, admin(AUTHOR))).toBeNull();
    expect(stepProblem('SUBMIT', draft, admin(OTHER))).toBe('broadcastNotYours');
    expect(stepProblem('SUBMIT', { ...draft, status: 'PENDING_APPROVAL' }, admin(AUTHOR))).toBe(
      'broadcastStepNotAllowed',
    );
    expect(stepProblem('SUBMIT', { ...draft, status: 'SENT' }, admin(AUTHOR))).toBe(
      'broadcastStepNotAllowed',
    );
  });

  it('never lets the author approve or reject their own message', () => {
    const pending = { status: 'PENDING_APPROVAL', createdBy: AUTHOR } as const;
    expect(stepProblem('APPROVE', pending, admin(AUTHOR))).toBe('broadcastOwn');
    expect(stepProblem('REJECT', pending, admin(AUTHOR))).toBe('broadcastOwn');
    expect(stepProblem('APPROVE', pending, admin(OTHER))).toBeNull();
    expect(stepProblem('REJECT', pending, admin(OTHER))).toBeNull();
  });

  it('keeps deciding to people with the approve permission', () => {
    const pending = { status: 'PENDING_APPROVAL', createdBy: AUTHOR } as const;
    expect(stepProblem('APPROVE', pending, admin(OTHER, false))).toBe('forbidden');
    expect(stepProblem('REJECT', pending, admin(OTHER, false))).toBe('forbidden');
  });

  it('decides only on a message that is waiting for approval', () => {
    for (const status of ['DRAFT', 'SENT', 'REJECTED'] as const) {
      expect(stepProblem('APPROVE', { status, createdBy: AUTHOR }, admin(OTHER))).toBe(
        'broadcastStepNotAllowed',
      );
    }
  });

  it('needs a Hebrew title and text before submitting', () => {
    expect(submitProblem({ hebrewTitle: 'כותרת', hebrewBody: 'טקסט' })).toBeNull();
    expect(submitProblem({ hebrewTitle: '  ', hebrewBody: 'טקסט' })).toBe(
      'broadcastHebrewRequired',
    );
    expect(submitProblem({ hebrewTitle: 'כותרת', hebrewBody: '' })).toBe('broadcastHebrewRequired');
  });

  it('splits the text into paragraphs at blank lines and keeps single line breaks', () => {
    expect(paragraphsOf('one\r\ntwo\n\n  three  \n\n\n\nfour')).toEqual([
      'one\ntwo',
      'three',
      'four',
    ]);
    expect(paragraphsOf('  \n ')).toEqual([]);
  });
});
