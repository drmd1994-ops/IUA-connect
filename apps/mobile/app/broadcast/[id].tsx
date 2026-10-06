import { useLocalSearchParams } from 'expo-router';
import { BroadcastMessage } from '@/features/account';

export default function BroadcastRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BroadcastMessage key={id} id={id} />;
}
