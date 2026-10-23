import { useLocalSearchParams } from 'expo-router';
import { WritePostScreen } from '@/features/communities';

export default function WritePostRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <WritePostScreen slug={slug} />;
}
