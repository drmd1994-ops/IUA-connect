import { useLocalSearchParams } from 'expo-router';
import { ProjectScreen } from '@/features/research';

export default function ProjectRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectScreen key={id} id={id} />;
}
