import {
  EDIT_WINDOW_MS,
  canEdit,
  lockActive,
  roomSendState,
  muteActive,
  muteFor,
  pairOf,
  preview,
  validIdempotencyKey,
} from './chat-rules';

describe('chat rules', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  const sent = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60 * 1000);

  describe('editing', () => {
    const message = { senderId: 'a', deletedAt: null, createdAt: sent(5) };

    it('is for the sender, within 15 minutes, while the message exists', () => {
      expect(canEdit(message, 'a', now)).toBe(true);
      expect(canEdit(message, 'b', now)).toBe(false);
      expect(canEdit({ ...message, deletedAt: now }, 'a', now)).toBe(false);
      expect(canEdit({ ...message, senderId: null }, 'a', now)).toBe(false);
    });

    it('ends when the window closes', () => {
      const atEdge = { ...message, createdAt: new Date(now.getTime() - EDIT_WINDOW_MS) };
      expect(canEdit(atEdge, 'a', now)).toBe(true);
      expect(canEdit({ ...message, createdAt: sent(16) }, 'a', now)).toBe(false);
    });
  });

  describe('muting', () => {
    it('stores an end for a timed mute and none for "until switched back"', () => {
      expect(muteFor('off', now)).toEqual({ muted: false, mutedUntil: null });
      expect(muteFor('8h', now)).toEqual({
        muted: true,
        mutedUntil: new Date('2026-10-04T18:00:00Z'),
      });
      expect(muteFor('week', now)).toEqual({
        muted: true,
        mutedUntil: new Date('2026-10-11T10:00:00Z'),
      });
      expect(muteFor('forever', now)).toEqual({ muted: true, mutedUntil: null });
    });

    it('a mute whose time has passed is no mute', () => {
      expect(muteActive({ muted: true, mutedUntil: null }, now)).toBe(true);
      expect(muteActive({ muted: true, mutedUntil: sent(-1) }, now)).toBe(true);
      expect(muteActive({ muted: true, mutedUntil: sent(1) }, now)).toBe(false);
      expect(muteActive({ muted: false, mutedUntil: null }, now)).toBe(false);
    });
  });

  it('orders the pair of a direct conversation the same way whoever starts it', () => {
    const a = '0190a000-0000-7000-8000-00000000000a';
    const b = '0190a000-0000-7000-8000-00000000000b';
    expect(pairOf(a, b)).toEqual({ userLowId: a, userHighId: b });
    expect(pairOf(b, a)).toEqual({ userLowId: a, userHighId: b });
    expect(pairOf(b.toUpperCase(), a)).toEqual({ userLowId: a, userHighId: b.toUpperCase() });
  });

  it('shows the start of a text on one line', () => {
    expect(preview('  first line\n\nsecond   line ')).toBe('first line second line');
    expect(preview('abcdef', 3)).toBe('abc…');
    expect(preview('abc', 3)).toBe('abc');
    // Cut at a whole character, not in the middle of one.
    expect(preview('שלום 👋🏽 עולם', 6)).toBe('שלום 👋…');
  });

  it('accepts only printable idempotency keys of a sane length', () => {
    expect(validIdempotencyKey('0190a000-0000-7000-8000-00000000000a')).toBe(true);
    expect(validIdempotencyKey('')).toBe(false);
    expect(validIdempotencyKey('with space')).toBe(false);
    expect(validIdempotencyKey('x'.repeat(101))).toBe(false);
    expect(validIdempotencyKey('מפתח')).toBe(false);
  });

  describe('writing in a room', () => {
    const room = { archivedAt: null, locked: false, lockedUntil: null, moderatorsOnly: false };
    const member = { activeMember: true, suspended: false, role: 'MEMBER' as const };
    const moderator = { ...member, role: 'MODERATOR' as const };

    it('is for people in the room with an active membership who are not suspended', () => {
      expect(roomSendState(room, member, now)).toBe('none');
      expect(roomSendState(room, { ...member, role: null }, now)).toBe('notJoined');
      expect(roomSendState(room, { ...member, activeMember: false }, now)).toBe('membersOnly');
      expect(roomSendState(room, { ...member, suspended: true }, now)).toBe('suspended');
    });

    it('stops for members in a locked room and in an announcements room; moderators still write', () => {
      const locked = { ...room, locked: true };
      const announcements = { ...room, moderatorsOnly: true };
      expect(roomSendState(locked, member, now)).toBe('locked');
      expect(roomSendState(announcements, member, now)).toBe('moderatorsOnly');
      expect(roomSendState(locked, moderator, now)).toBe('none');
      expect(roomSendState(announcements, moderator, now)).toBe('none');
      // A suspended moderator, or one whose membership ended, doesn't write either.
      expect(roomSendState(room, { ...moderator, suspended: true }, now)).toBe('suspended');
      expect(roomSendState(room, { ...moderator, activeMember: false }, now)).toBe('membersOnly');
    });

    it('stops for everyone in an archived room', () => {
      const archived = { ...room, archivedAt: now };
      expect(roomSendState(archived, member, now)).toBe('archived');
      expect(roomSendState(archived, moderator, now)).toBe('archived');
    });

    it('a lock whose time has passed is no lock', () => {
      expect(lockActive({ locked: true, lockedUntil: null }, now)).toBe(true);
      expect(lockActive({ locked: true, lockedUntil: sent(-5) }, now)).toBe(true);
      expect(lockActive({ locked: true, lockedUntil: sent(5) }, now)).toBe(false);
      expect(lockActive({ locked: false, lockedUntil: null }, now)).toBe(false);
      expect(roomSendState({ ...room, locked: true, lockedUntil: sent(5) }, member, now)).toBe(
        'none',
      );
    });
  });
});
