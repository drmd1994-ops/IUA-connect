/**
 * What the event screens decide without the phone or the server: what the registration panel
 * says and offers, how a time range is written, and how sessions are grouped by day. The API
 * decides who may register; this only chooses the words and the button.
 */

export interface EventForPanel {
  registrationMode: 'INTERNAL' | 'EXTERNAL' | 'NONE';
  registrationOpen: boolean;
  registrationUrl: string | null;
  placesLeft: number | null;
  cancelled: boolean;
}

export interface MyRegistration {
  status: 'NONE' | 'REGISTERED' | 'WAITLISTED';
  waitingPosition: number | null;
  sessionIds: readonly string[];
}

export type RegistrationPanel =
  | { kind: 'none' }
  /** Registration happens on another site; the address is offered unless the event is cancelled. */
  | { kind: 'external'; url: string | null }
  | {
      kind: 'member';
      mine: MyRegistration['status'];
      /** The place on the waiting list, when on it. */
      position: number | null;
      /** What is said to someone not registered. */
      note: 'closed' | 'full' | 'placesLeft' | null;
      placesLeft: number | null;
      action: 'register' | 'joinWaitingList' | 'cancel' | 'leaveWaitingList' | null;
    };

export function registrationPanel(
  event: EventForPanel,
  registration: MyRegistration | null,
): RegistrationPanel {
  if (event.registrationMode === 'NONE') return { kind: 'none' };
  if (event.registrationMode === 'EXTERNAL') {
    return { kind: 'external', url: event.cancelled ? null : event.registrationUrl };
  }
  const mine = registration?.status ?? 'NONE';
  const full = event.placesLeft === 0;
  let note: 'closed' | 'full' | 'placesLeft' | null = null;
  if (mine === 'NONE') {
    if (!event.registrationOpen) note = 'closed';
    else if (full) note = 'full';
    else if (event.placesLeft !== null) note = 'placesLeft';
  }
  let action: 'register' | 'joinWaitingList' | 'cancel' | 'leaveWaitingList' | null = null;
  if (event.registrationOpen) {
    if (mine === 'NONE') action = full ? 'joinWaitingList' : 'register';
    else action = mine === 'WAITLISTED' ? 'leaveWaitingList' : 'cancel';
  }
  return {
    kind: 'member',
    mine,
    position: mine === 'WAITLISTED' ? (registration?.waitingPosition ?? 1) : null,
    note,
    placesLeft: event.placesLeft,
    action,
  };
}

/** Ticks a session, or unticks it. */
export function toggleSession(chosen: readonly string[], id: string): string[] {
  return chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id];
}

/** Sessions in the order they came, grouped under the day each starts on. */
export function groupByDay<T extends { startAt: string }>(
  sessions: readonly T[],
  day: (iso: string) => string,
): { day: string; sessions: T[] }[] {
  const groups: { day: string; sessions: T[] }[] = [];
  for (const session of sessions) {
    const label = day(session.startAt);
    const last = groups[groups.length - 1];
    if (last?.day === label) last.sessions.push(session);
    else groups.push({ day: label, sessions: [session] });
  }
  return groups;
}

/**
 * "9 January 2030, 09:00 – 18:00", or both days in full when the event spans several. The
 * phone's own range formatting is not relied on: not every phone has it.
 */
export function writeRange(
  startIso: string,
  endIso: string,
  write: { day: (iso: string) => string; time: (iso: string) => string },
): string {
  const startDay = write.day(startIso);
  const endDay = write.day(endIso);
  if (startDay === endDay) {
    return `${startDay}, ${write.time(startIso)} – ${write.time(endIso)}`;
  }
  return `${startDay}, ${write.time(startIso)} – ${endDay}, ${write.time(endIso)}`;
}

/** A map address for a place, or nothing when the event has no coordinates. */
export function mapUrl(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
