import { initials, personName } from '@medconnect/api-client/chat';
import { colors, semantic } from '@medconnect/ui-tokens';
import { Image } from 'expo-image';
import { type ReactNode, useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useFileUrl } from '@/features/files';
import { useSession } from '@/session/session-provider';
import { Body, Button, Notice } from '@/ui/kit';

/** Someone as chat shows them. A deleted account has no id; an unlisted member no name. */
export interface Person {
  id: string | null;
  firstName: string | null;
  lastName: string | null;
  photoFileId?: string | null;
}

/** The name to show for a person: theirs, or what is said when there is none. */
export function usePersonLabel() {
  const t = useTranslations('chat.list');
  return useCallback(
    (person: Person) => personName(person) ?? t(person.id ? 'unknownPerson' : 'deletedAccount'),
    [t],
  );
}

/** Sends a request with a JSON body and reads the JSON answer. */
export function useSend() {
  const { request } = useSession();
  return useCallback(
    <T,>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
      request<T>(path, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    [request],
  );
}

/** A person's photo in a circle, or their initials. Decorative: the name stands beside it. */
export function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  const url = useFileUrl(person.photoFileId ?? null, 'thumb');
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} style={shape} contentFit="cover" />;
  return (
    <View style={[styles.avatar, shape]} importantForAccessibility="no-hide-descendants">
      <Text style={styles.avatarText}>{initials(person)}</Text>
    </View>
  );
}

/** A panel that rises from the bottom, over the screen. The phone's back button closes it. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('chat.details');
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={styles.above} onPress={onClose} accessible={false} />
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {title}
            </Text>
            {children}
            <Button label={t('close')} variant="secondary" onPress={onClose} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Asks before something that can't be taken back. An error stays in the panel. */
export function Confirm({
  title,
  text,
  confirmLabel,
  danger = true,
  disabled = false,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  /** What must be filled in before it can be confirmed is not yet. */
  disabled?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const all = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <Sheet title={title} onClose={onClose}>
      {text ? <Body>{text}</Body> : null}
      {children}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button
        label={confirmLabel}
        variant={danger ? 'danger' : 'primary'}
        pending={pending}
        disabled={disabled}
        onPress={() => {
          setPending(true);
          setError(null);
          onConfirm().then(onClose, (caught: unknown) => {
            setError(caught);
            setPending(false);
          });
        }}
      />
    </Sheet>
  );
}

/** One choice in a panel: a full-width row. */
export function Row({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.rowText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: colors.brand[100], alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '600', color: colors.brand[900] },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  above: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    backgroundColor: semantic.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetContent: { padding: 20, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: colors.brand[900] },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  rowText: { fontSize: 16, color: semantic.text },
  danger: { color: colors.danger[700] },
  pressed: { opacity: 0.7 },
});
