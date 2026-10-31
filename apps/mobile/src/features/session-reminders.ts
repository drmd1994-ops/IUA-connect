import * as Notifications from 'expo-notifications';

/**
 * A reminder on the phone itself, ten minutes before a session in the person's schedule (M32,
 * the owner's answer 4B). It is scheduled here, with no outside service, so it comes on a locked
 * phone, also without a connection in the hall.
 */
const LEAD_MS = 10 * 60 * 1000;
/** Android keeps only so many alarms for one app; the soonest are the ones that matter. */
const MOST = 30;
const CHANNEL = 'sessions';

export interface ReminderSession {
  id: string;
  title: string;
  room: string | null;
  startAt: string;
}

/** What to schedule now: sessions whose reminder is still ahead, the soonest first. */
export function remindersToSchedule(
  sessions: readonly ReminderSession[],
  now: Date,
): (ReminderSession & { at: Date })[] {
  return sessions
    .map((session) => ({ ...session, at: new Date(Date.parse(session.startAt) - LEAD_MS) }))
    .filter((session) => session.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MOST);
}

/** Asks the phone for permission, at a moment when the person can see why: saving a schedule. */
export async function askForReminders(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Makes the phone's reminders match the schedule. It never asks for permission: without it, there
 * is nothing to do, and the notice in the app still comes.
 */
export async function syncReminders(
  sessions: readonly ReminderSession[],
  texts: { channel: string; title: string; body: (session: ReminderSession) => string },
  now = new Date(),
): Promise<void> {
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: texts.channel,
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const session of remindersToSchedule(sessions, now)) {
    await Notifications.scheduleNotificationAsync({
      identifier: `session-${session.id}`,
      content: { title: texts.title, body: texts.body(session) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: session.at,
        channelId: CHANNEL,
      },
    });
  }
}

/** Signing out: the phone stops reminding of that person's sessions. */
export async function clearReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
