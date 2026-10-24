import { useLocalSearchParams } from 'expo-router';
import { JournalClubEntryScreen } from '@/features/journal-club';

export default function JournalClubEntryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <JournalClubEntryScreen key={id} id={id} />;
}
