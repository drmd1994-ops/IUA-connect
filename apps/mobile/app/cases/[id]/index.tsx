import { useLocalSearchParams } from 'expo-router';
import { CaseScreen } from '@/features/cases';

export default function CaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaseScreen key={id} id={id} />;
}
