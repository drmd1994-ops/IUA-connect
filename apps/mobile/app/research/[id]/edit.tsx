import { useLocalSearchParams } from 'expo-router';
import { ProjectFormScreen } from '@/features/research';

export default function EditProjectRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectFormScreen key={id} id={id} />;
}
