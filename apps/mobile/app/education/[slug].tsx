import { useLocalSearchParams } from 'expo-router';
import { EducationItem } from '@/features/education';

export default function EducationItemScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <EducationItem key={slug} slug={slug} />;
}
