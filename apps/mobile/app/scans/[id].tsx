import { useLocalSearchParams } from 'expo-router';
import { ScanViewerScreen } from '@/features/imaging';

export default function ScanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ScanViewerScreen key={id} id={id} />;
}
