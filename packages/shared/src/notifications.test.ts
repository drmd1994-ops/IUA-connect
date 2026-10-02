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

  it('starts with new-content email off and everything else on', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const content = (CONTENT_NOTIFICATION_KINDS as readonly string[]).includes(kind);
      expect(notificationEnabled(kind, 'APP', [])).toBe(true);
      expect(notificationEnabled(kind, 'EMAIL', [])).toBe(!content);
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

  it('shows every kind in the preferences except staff work', () => {
    expect([...NOTIFICATION_PREFERENCE_KINDS].sort()).toEqual(
      NOTIFICATION_KINDS.filter((kind) => kind !== 'WORK').sort(),
    );
  });
});
