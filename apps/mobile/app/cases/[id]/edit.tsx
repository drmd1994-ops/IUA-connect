import { useLocalSearchParams } from 'expo-router';
import { WriteCaseScreen } from '@/features/cases';

export default function EditCaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WriteCaseScreen key={id} id={id} />;
}
