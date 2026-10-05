import { describe, expect, it } from 'vitest';
import {
  attachmentKind,
  banDays,
  fileName,
  isThreadKind,
  listKind,
  messageActions,
  takeBlocks,
  threadPath,
  threadRoute,
} from './model';

const theirs = { id: 'm', mine: false, deleted: false, canEdit: false, senderId: 'u', body: 'hi' };
const mine = { id: 'm', mine: true, deleted: false, canEdit: true, senderId: 'me', body: 'hi' };
const member = { kind: 'direct', canWrite: true, canModerate: false, pinned: false } as const;

describe('where a thread lives', () => {
  it('has one API address per kind', () => {
    expect(threadPath('direct', 'a')).toBe('/api/v1/chat/conversations/a');
    expect(threadPath('group', 'a')).toBe('/api/v1/chat/groups/a');
    expect(threadPath('room', 'a b')).toBe('/api/v1/chat/rooms/a%20b');
  });

  it('has one screen for all three kinds', () => {
    expect(threadRoute('room', 'x')).toBe('/thread/room/x');
    expect(listKind('GROUP')).toBe('group');
    expect(listKind('DIRECT')).toBe('direct');
    expect(isThreadKind('room')).toBe(true);
    expect(isThreadKind('admin')).toBe(false);
  });
});

describe('what may be done with a message', () => {
  it('lets a member answer, forward, hide and report someone else’s message', () => {
    expect(messageActions(theirs, member)).toEqual([
      'reply',
      'forward',
      'copy',
      'deleteMine',
      'report',
    ]);
  });

  it('lets the writer edit and delete their own, and never report it', () => {
    expect(messageActions(mine, member)).toEqual([
      'reply',
      'forward',
      'copy',
      'edit',
      'deleteAll',
      'deleteMine',
    ]);
  });

  it('offers no reply where the reader can’t write', () => {
    expect(messageActions(theirs, { ...member, canWrite: false })).toEqual([
      'forward',
      'copy',
      'deleteMine',
      'report',
    ]);
  });

  it('offers no copy for a message that is only files', () => {
    expect(messageActions({ ...theirs, body: '' }, member)).not.toContain('copy');
  });

  it('leaves only hiding for a deleted message', () => {
    expect(messageActions({ ...theirs, deleted: true }, member)).toEqual(['deleteMine']);
  });

  it('gives a room’s moderator the moderation tools, and nobody else', () => {
    const moderator = { kind: 'room', canWrite: true, canModerate: true, pinned: false } as const;
    expect(messageActions(theirs, moderator)).toEqual([
      'reply',
      'forward',
      'copy',
      'deleteMine',
      'report',
      'pin',
      'remove',
      'removePerson',
      'banPerson',
    ]);
    expect(messageActions(theirs, { ...moderator, pinned: true })).toContain('unpin');
    expect(messageActions(mine, moderator)).not.toContain('remove');
    expect(messageActions(mine, moderator)).not.toContain('banPerson');
    expect(messageActions(theirs, { ...moderator, canModerate: false })).not.toContain('pin');
    // Being able to moderate means nothing outside a room.
    expect(messageActions(theirs, { ...moderator, kind: 'group' })).not.toContain('remove');
  });
});

describe('a file picked for a message', () => {
  it('is a picture, a PDF or an MP4 video, and nothing else', () => {
    expect(attachmentKind('image/jpeg')).toBe('IMAGE');
    expect(attachmentKind('IMAGE/PNG')).toBe('IMAGE');
    expect(attachmentKind('application/pdf')).toBe('DOCUMENT');
    expect(attachmentKind('video/mp4')).toBe('VIDEO');
    expect(attachmentKind('image/heic')).toBeNull();
    expect(attachmentKind('video/quicktime')).toBeNull();
    expect(attachmentKind(null)).toBeNull();
  });

  it('gets a name when the phone gave none', () => {
    expect(fileName('file:///a/b/photo.jpg', 'image/jpeg', 'Scan.pdf')).toBe('Scan.pdf');
    expect(fileName('file:///a/b/photo.jpg?x=1', 'image/jpeg')).toBe('photo.jpg');
    expect(fileName('content://media/1234', 'image/png', ' ')).toBe('file.png');
    expect(fileName('content://media/1234', 'video/mp4')).toBe('file.mp4');
  });
});

describe('the days of a ban', () => {
  it('reads empty as "until lifted" and a number from 1 to 365', () => {
    expect(banDays('')).toEqual({ ok: true, days: null });
    expect(banDays(' 30 ')).toEqual({ ok: true, days: 30 });
    expect(banDays('0')).toEqual({ ok: false });
    expect(banDays('366')).toEqual({ ok: false });
    expect(banDays('ten')).toEqual({ ok: false });
  });
});

describe('the live stream', () => {
  it('hands over whole blocks and keeps the unfinished one', () => {
    expect(takeBlocks('data: {"type":"ping"}\n\ndata: {"ty')).toEqual({
      blocks: ['data: {"type":"ping"}'],
      rest: 'data: {"ty',
    });
    expect(takeBlocks('a\r\n\r\nb\r\n\r\n')).toEqual({ blocks: ['a', 'b'], rest: '' });
    expect(takeBlocks('')).toEqual({ blocks: [], rest: '' });
  });
});
