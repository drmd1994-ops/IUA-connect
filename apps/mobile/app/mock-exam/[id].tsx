import { useLocalSearchParams } from 'expo-router';
import { MockExamSitting } from '@/features/question-bank';

export default function MockExamRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MockExamSitting key={id} id={id} />;
}
