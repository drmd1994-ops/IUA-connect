import { useLocalSearchParams } from 'expo-router';
import { GuidelineView } from '@/features/browse';

export default function GuidelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GuidelineView key={id} id={id} />;
}
