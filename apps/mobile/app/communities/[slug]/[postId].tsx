import { useLocalSearchParams } from 'expo-router';
import { PostScreen } from '@/features/communities';

export default function PostRoute() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  return <PostScreen key={postId} id={postId} />;
}
