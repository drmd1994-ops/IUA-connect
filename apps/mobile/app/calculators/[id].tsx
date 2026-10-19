import { useLocalSearchParams } from 'expo-router';
import { CalculatorScreen } from '@/features/calculators';

export default function CalculatorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CalculatorScreen key={id} id={id} />;
}
