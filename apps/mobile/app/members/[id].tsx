import { useLocalSearchParams } from 'expo-router';
import { MemberPage } from '@/features/browse';

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MemberPage key={id} id={id} />;
}
