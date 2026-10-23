import { useLocalSearchParams } from 'expo-router';
import { CommunityScreen } from '@/features/communities';

export default function CommunityRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <CommunityScreen key={slug} slug={slug} />;
}
