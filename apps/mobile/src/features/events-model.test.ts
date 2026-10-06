import { describe, expect, it } from 'vitest';
import {
  type EventForPanel,
  groupByDay,
  mapUrl,
  registrationPanel,
  toggleSession,
  writeRange,
} from './events-model';

const open: EventForPanel = {
  registrationMode: 'INTERNAL',
  registrationOpen: true,
  registrationUrl: null,
  placesLeft: 12,
  cancelled: false,
};
const none = { status: 'NONE', waitingPosition: null, sessionIds: [] } as const;

describe('the registration panel', () => {
  it('offers to register while there are places', () => {
    expect(registrationPanel(open, none)).toEqual({
      kind: 'member',
      mine: 'NONE',
      position: null,
      note: 'placesLeft',
      placesLeft: 12,
      action: 'register',
    });
  });

  it('says nothing about places when the event has no limit', () => {
    expect(registrationPanel({ ...open, placesLeft: null }, none)).toMatchObject({
      note: null,
      action: 'register',
    });
  });

  it('offers the waiting list when the event is full', () => {
    expect(registrationPanel({ ...open, placesLeft: 0 }, none)).toMatchObject({
      note: 'full',
      action: 'joinWaitingList',
    });
  });

  it('offers to cancel to someone registered, also when the event is full', () => {
    const mine = { status: 'REGISTERED', waitingPosition: null, sessionIds: ['a'] } as const;
    expect(registrationPanel({ ...open, placesLeft: 0 }, mine)).toMatchObject({
      mine: 'REGISTERED',
      note: null,
      action: 'cancel',
    });
  });

  it('tells someone waiting their place and offers to leave the list', () => {
    const mine = { status: 'WAITLISTED', waitingPosition: 3, sessionIds: [] } as const;
    expect(registrationPanel({ ...open, placesLeft: 0 }, mine)).toMatchObject({
      mine: 'WAITLISTED',
      position: 3,
      action: 'leaveWaitingList',
    });
  });

  it('offers nothing when registration is closed', () => {
    expect(registrationPanel({ ...open, registrationOpen: false }, none)).toMatchObject({
      note: 'closed',
      action: null,
    });
    const mine = { status: 'REGISTERED', waitingPosition: null, sessionIds: [] } as const;
    expect(registrationPanel({ ...open, registrationOpen: false }, mine)).toMatchObject({
      mine: 'REGISTERED',
      action: null,
    });
  });

  it('sends to the other site, unless the event was cancelled', () => {
    const external: EventForPanel = {
      ...open,
      registrationMode: 'EXTERNAL',
      registrationUrl: 'https://tickets.example.test/e',
    };
    expect(registrationPanel(external, null)).toEqual({
      kind: 'external',
      url: 'https://tickets.example.test/e',
    });
    expect(registrationPanel({ ...external, cancelled: true }, null)).toEqual({
      kind: 'external',
      url: null,
    });
  });

  it('says so when no registration is needed', () => {
    expect(registrationPanel({ ...open, registrationMode: 'NONE' }, null)).toEqual({
      kind: 'none',
    });
  });
});

describe('the programme', () => {
  it('ticks and unticks a session', () => {
    expect(toggleSession(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSession(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('groups sessions under their day, in the order they came', () => {
    const sessions = [
      { id: '1', startAt: '2030-01-09T07:00:00Z' },
      { id: '2', startAt: '2030-01-09T09:00:00Z' },
      { id: '3', startAt: '2030-01-10T07:00:00Z' },
    ];
    const groups = groupByDay(sessions, (iso) => iso.slice(0, 10));
    expect(groups.map((g) => [g.day, g.sessions.map((s) => s.id)])).toEqual([
      ['2030-01-09', ['1', '2']],
      ['2030-01-10', ['3']],
    ]);
  });
});

describe('a time range', () => {
  const write = {
    day: (iso: string) => iso.slice(0, 10),
    time: (iso: string) => iso.slice(11, 16),
  };

  it('names the day once when both ends are on it', () => {
    expect(writeRange('2030-01-09T09:00:00Z', '2030-01-09T18:00:00Z', write)).toBe(
      '2030-01-09, 09:00 – 18:00',
    );
  });

  it('names both days when the event spans several', () => {
    expect(writeRange('2030-01-09T09:00:00Z', '2030-01-11T13:00:00Z', write)).toBe(
      '2030-01-09, 09:00 – 2030-01-11, 13:00',
    );
  });
});

describe('the map link', () => {
  it('exists only for a place with coordinates', () => {
    expect(mapUrl(null, 34.8)).toBeNull();
    expect(mapUrl(32.08, 34.78)).toBe(
      'https://www.openstreetmap.org/?mlat=32.08&mlon=34.78#map=16/32.08/34.78',
    );
  });
});
