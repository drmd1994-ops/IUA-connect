import { useLocalSearchParams } from 'expo-router';
import { EventPage } from '@/features/events';

export default function EventScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <EventPage slug={slug} />;
}
