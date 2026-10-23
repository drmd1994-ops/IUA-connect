import { useLocalSearchParams } from 'expo-router';
import { PositionScreen } from '@/features/careers';

export default function PositionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PositionScreen key={id} id={id} />;
}
