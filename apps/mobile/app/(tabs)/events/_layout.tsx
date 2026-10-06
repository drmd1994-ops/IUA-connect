import { Stack } from 'expo-router';

/** Events keep their own way back: from an event or the schedule to the list. */
export default function EventsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
