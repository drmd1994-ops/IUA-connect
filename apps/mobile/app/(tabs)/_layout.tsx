import { colors, semantic } from '@iua/ui-tokens';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslations } from 'use-intl';
import { useChatEvents } from '@/chat/events';
import { useGuest } from '@/features/visitor';
import { useSession } from '@/session/session-provider';

/** Simple line drawings for the tabs; the label beside each says what it is. */
const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5',
  events: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chat: 'M4 5h16v11H9l-5 4z',
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
  const all = useTranslations();
  const { request } = useSession();
  const { guest } = useGuest();
  const [unread, setUnread] = useState(0);
  const count = useCallback(() => {
    if (guest) return;
    request<{ conversations: number }>('/api/v1/chat/unread-count')
      .then((result) => setUnread(result.conversations))
      .catch(() => undefined);
  }, [request, guest]);
  useEffect(count, [count]);
  useChatEvents((event) => {
    if (event.type !== 'typing' && event.type !== 'activity') count();
  });
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
      <Tabs.Screen name="news" options={{ title: t('news'), tabBarIcon: icon('news') }} />
      <Tabs.Screen name="events" options={{ title: t('events'), tabBarIcon: icon('events') }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('chat'),
          tabBarIcon: icon('chat'),
          href: guest ? null : undefined,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarAccessibilityLabel: all('chat.link.unread', { count: unread }),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: t('me'), tabBarIcon: icon('me'), href: guest ? null : undefined }}
      />
    </Tabs>
  );
}
