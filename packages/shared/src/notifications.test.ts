import { describe, expect, it } from 'vitest';
import {
  CONTENT_NOTIFICATION_KINDS,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_KINDS,
  NOTIFICATION_PREFERENCE_KINDS,
  notificationEnabled,
} from './notifications';

describe('notification settings', () => {
  it('has a starting setting for every kind', () => {
    expect(Object.keys(NOTIFICATION_DEFAULTS).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it('starts with email off for new content, chat rooms and communities, and everything else on', () => {
    for (const kind of NOTIFICATION_KINDS) {
      // New content arrives as one daily summary (M7); chat rooms by the owner's answer in M12,
      // and communities, which replace them (M25), the same way.
      const emailOff =
        (CONTENT_NOTIFICATION_KINDS as readonly string[]).includes(kind) ||
        kind === 'ROOMS' ||
        kind === 'COMMUNITIES';
      expect(notificationEnabled(kind, 'APP', [])).toBe(true);
      expect(notificationEnabled(kind, 'EMAIL', [])).toBe(!emailOff);
    }
  });

  it('lets a stored switch override the starting setting, per channel', () => {
    const stored = [
      { kind: 'NEWS', channel: 'EMAIL', enabled: true },
      { kind: 'MY_EVENTS', channel: 'APP', enabled: false },
    ] as const;
    expect(notificationEnabled('NEWS', 'EMAIL', stored)).toBe(true);
    expect(notificationEnabled('NEWS', 'APP', stored)).toBe(true);
    expect(notificationEnabled('MY_EVENTS', 'APP', stored)).toBe(false);
    expect(notificationEnabled('MY_EVENTS', 'EMAIL', stored)).toBe(true);
    expect(notificationEnabled('EDUCATION', 'EMAIL', stored)).toBe(false);
  });

  it('keeps the locked kinds on whatever was stored', () => {
    const stored = [
      { kind: 'ACCOUNT', channel: 'EMAIL', enabled: false },
      { kind: 'WORK', channel: 'APP', enabled: false },
    ] as const;
    expect(notificationEnabled('ACCOUNT', 'EMAIL', stored)).toBe(true);
    expect(notificationEnabled('WORK', 'APP', stored)).toBe(true);
  });

  it('shows every kind in the preferences except staff work and the closed chat rooms', () => {
    expect([...NOTIFICATION_PREFERENCE_KINDS].sort()).toEqual(
      NOTIFICATION_KINDS.filter((kind) => kind !== 'WORK' && kind !== 'ROOMS').sort(),
    );
  });
});
