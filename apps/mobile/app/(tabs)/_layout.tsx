import { colors, semantic } from '@iua/ui-tokens';
import { Tabs } from 'expo-router';
import { type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslations } from 'use-intl';

/** Simple line drawings for the tabs; the label beside each says what it is. */
const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
} as const;

function icon(name: keyof typeof ICONS) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={ICONS[name]}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  };
}

/** The member's screens, one tab each. A tab is added when its screen exists. */
export default function TabsLayout() {
  const t = useTranslations('mobile.tabs');
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: semantic.primary,
        tabBarInactiveTintColor: colors.neutral[600],
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { minHeight: 60 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('home'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="card" options={{ title: t('card'), tabBarIcon: icon('card') }} />
      <Tabs.Screen name="me" options={{ title: t('me'), tabBarIcon: icon('me') }} />
    </Tabs>
  );
}
