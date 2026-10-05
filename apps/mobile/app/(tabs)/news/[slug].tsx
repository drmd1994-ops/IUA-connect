import { useLocalSearchParams } from 'expo-router';
import { NewsArticle } from '@/features/news';

export default function NewsItem() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <NewsArticle slug={slug} />;
}
