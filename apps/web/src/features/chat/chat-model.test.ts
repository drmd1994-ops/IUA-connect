import { describe, expect, it } from 'vitest';
import {
  type Message,
  initials,
  mentionAt,
  mergeMessages,
  messageParts,
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
  sender: { id: 'a', firstName: 'Dana', lastName: 'Fictional', photoFileId: null, listed: false },
  mine: true,
  body,
  deleted: false,
  removedByModerator: false,
  announcement: false,
  senderBlocked: false,
  mentions: [],
  reactions: [],
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

  it('marks the mentions in a text, the longer name first', () => {
    expect(
      messageParts('Hi @Dana Levi and @Dana, see https://example.test', ['Dana', 'Dana Levi']),
    ).toEqual([
      { text: 'Hi ', kind: 'text' },
      { text: '@Dana Levi', kind: 'mention' },
      { text: ' and ', kind: 'text' },
      { text: '@Dana', kind: 'mention' },
      { text: ', see ', kind: 'text' },
      { text: 'https://example.test', kind: 'link' },
    ]);
    // A name nobody was mentioned by stays plain text.
    expect(messageParts('Hi @Someone', [])).toEqual([{ text: 'Hi @Someone', kind: 'text' }]);
    expect(messageParts('שלום @נועה בר', ['נועה בר'])).toEqual([
      { text: 'שלום ', kind: 'text' },
      { text: '@נועה בר', kind: 'mention' },
    ]);
  });

  it('finds the "@…" being typed before the cursor', () => {
    expect(mentionAt('Hello @Da', 9)).toEqual({ start: 6, query: 'Da' });
    expect(mentionAt('@נוע', 4)).toEqual({ start: 0, query: 'נוע' });
    expect(mentionAt('Hello @Dana Le', 14)).toEqual({ start: 6, query: 'Dana Le' });
    // Not inside a word (an email address), not after a finished word, not three words.
    expect(mentionAt('mail me at a@b', 14)).toBeNull();
    expect(mentionAt('Hello @Dana ', 12)).toBeNull();
    expect(mentionAt('Hello @Dana Levi Cohen', 22)).toBeNull();
    expect(mentionAt('Hello @', 7)).toBeNull();
    // Only what is before the cursor counts.
    expect(mentionAt('@Da and more', 3)).toEqual({ start: 0, query: 'Da' });
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
