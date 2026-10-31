import { useLocalSearchParams } from 'expo-router';
import { LiveSessionScreen } from '@/features/events-live';

export default function LiveSessionRoute() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  return <LiveSessionScreen slug={slug} sessionId={id} />;
}
