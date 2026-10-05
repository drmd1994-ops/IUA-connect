import { Stack } from 'expo-router';

/** News keeps its own way back: from an item to the list, with the tabs still below. */
export default function NewsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
