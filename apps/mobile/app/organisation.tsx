import { useLocalSearchParams } from 'expo-router';
import { OrganisationScreen } from '@/features/organisation';

export default function OrganisationRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  return <OrganisationScreen key={slug ?? ''} slug={slug} />;
}
