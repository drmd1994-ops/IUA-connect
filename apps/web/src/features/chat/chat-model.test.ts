import { describe, expect, it } from 'vitest';
import {
  type Message,
  initials,
  mergeMessages,
  messageStatus,
  parseEvent,
  personName,
  textParts,
} from './chat-model';

const message = (seq: number, body = `m${seq}`): Message => ({
  id: `id-${seq}`,
  conversationId: 'c',
  seq,
  senderId: 'a',
  mine: true,
  body,
  deleted: false,
  editedAt: null,
  createdAt: '2026-10-04T10:00:00.000Z',
  canEdit: true,
  replyTo: null,
});

describe('chat model', () => {
  it('names a person, or nothing for a deleted account', () => {
    expect(personName({ firstName: 'Dana', lastName: 'Fictional' })).toBe('Dana Fictional');
    expect(personName({ firstName: 'Dana', lastName: null })).toBe('Dana');
    expect(personName({ firstName: null, lastName: null })).toBeNull();
    expect(initials({ firstName: 'dana', lastName: 'fictional' })).toBe('DF');
    expect(initials({ firstName: 'דנה', lastName: 'בדויה' })).toBe('דב');
    expect(initials({ firstName: null, lastName: null })).toBe('');
  });

  it('works out sent, delivered and read from the other person’s two markers', () => {
    const markers = { otherDeliveredSeq: 5, otherReadSeq: 3 };
    expect(messageStatus(2, markers)).toBe('read');
    expect(messageStatus(3, markers)).toBe('read');
    expect(messageStatus(4, markers)).toBe('delivered');
    expect(messageStatus(6, markers)).toBe('sent');
    // Read status switched off on either side: never more than "delivered".
    expect(messageStatus(2, { otherDeliveredSeq: 5, otherReadSeq: null })).toBe('delivered');
  });

  it('cuts a text into plain pieces and web addresses', () => {
    expect(textParts('see https://example.test/a?b=1 and http://example.test.')).toEqual([
      { text: 'see ', link: false },
      { text: 'https://example.test/a?b=1', link: true },
      { text: ' and ', link: false },
      { text: 'http://example.test', link: true },
      { text: '.', link: false },
    ]);
    expect(textParts('javascript:alert(1) <b>x</b>')).toEqual([
      { text: 'javascript:alert(1) <b>x</b>', link: false },
    ]);
    expect(textParts('')).toEqual([]);
  });

  it('merges messages by id and keeps them in order', () => {
    const merged = mergeMessages(
      [message(1), message(3)],
      [message(2), message(3, 'edited'), message(4)],
    );
    expect(merged.map((m) => [m.seq, m.body])).toEqual([
      [1, 'm1'],
      [2, 'm2'],
      [3, 'edited'],
      [4, 'm4'],
    ]);
  });

  it('reads an event from a block of the stream', () => {
    expect(parseEvent('id: 3\ndata: {"type":"typing","conversationId":"c","userId":"u"}')).toEqual({
      type: 'typing',
      conversationId: 'c',
      userId: 'u',
    });
    expect(parseEvent('id: 3')).toBeNull();
    expect(parseEvent('data: not json')).toBeNull();
    expect(parseEvent('data: {"no":"type"}')).toBeNull();
  });
});
