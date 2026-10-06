import { colors, semantic } from '@iua/ui-tokens';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

/**
 * The few building blocks every screen is made of. Colours come from the shared design tokens,
 * the same ones the site uses. Every control is at least 48 points high and has a role and a
 * name for a screen reader; text sizes follow the phone's own text-size setting.
 */

/** A screen: the demo banner, then its content, scrollable and clear of the phone's edges. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTranslations('mobile');
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.banner} accessibilityRole="text">
        {t('demoBanner')}
      </Text>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** A message that matters: an error is announced at once, anything else politely. */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning';
  children: ReactNode;
}) {
  return (
    <View
      style={[styles.notice, noticeTones[tone]]}
      // One thing for a screen reader, so that "alert" is said of the whole message.
      accessible
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
    >
      <Text style={[styles.body, { color: noticeText[tone] }]}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  pending = false,
  disabled = false,
  hint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'link' | 'danger';
  pending?: boolean;
  disabled?: boolean;
  /** Said by a screen reader after the label. */
  hint?: string;
}) {
  const off = disabled || pending;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole={variant === 'link' ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: off, busy: pending }}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant],
        pressed && styles.pressed,
        off && styles.off,
      ]}
    >
      {pending && (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger' ? semantic.onPrimary : semantic.primary
          }
        />
      )}
      <Text style={[styles.buttonText, buttonTexts[variant]]}>{label}</Text>
    </Pressable>
  );
}

/** The way back from a screen that was opened over another. */
export function Back() {
  const t = useTranslations('mobile');
  const router = useRouter();
  return (
    <Button
      label={t('back')}
      variant="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & Omit<TextInputProps, 'style'>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={[styles.small, styles.muted]}>{hint}</Text> : null}
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.neutral[500]}
        style={styles.input}
      />
    </View>
  );
}

/** A yes/no choice with its explanation; the whole row is the control. */
export function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.toggle, disabled && styles.off]}
    >
      <View style={[styles.box, value && styles.boxOn]}>
        {value ? <View style={styles.boxMark} /> : null}
      </View>
      <View style={styles.toggleText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={[styles.small, styles.muted]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const noticeTones = StyleSheet.create({
  info: { backgroundColor: colors.brand[50], borderColor: colors.brand[200] },
  error: { backgroundColor: colors.danger[100], borderColor: colors.danger[700] },
  success: { backgroundColor: colors.success[100], borderColor: colors.success[700] },
  warning: { backgroundColor: colors.warning[100], borderColor: colors.warning[700] },
});
const noticeText = {
  info: colors.brand[900],
  error: colors.danger[700],
  success: colors.success[700],
  warning: colors.warning[700],
} as const;

const buttonVariants = StyleSheet.create({
  primary: { backgroundColor: semantic.primary },
  secondary: { backgroundColor: semantic.surface, borderWidth: 1, borderColor: semantic.border },
  link: { backgroundColor: 'transparent', paddingHorizontal: 0, justifyContent: 'flex-start' },
  danger: { backgroundColor: colors.danger[700] },
});
const buttonTexts = StyleSheet.create({
  primary: { color: semantic.onPrimary },
  secondary: { color: semantic.text },
  link: { color: semantic.primary, textDecorationLine: 'underline' },
  danger: { color: semantic.onPrimary },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  banner: {
    backgroundColor: colors.accent[100],
    color: colors.accent[700],
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '600', color: colors.brand[900] },
  heading: { fontSize: 20, fontWeight: '600', color: colors.brand[900] },
  body: { fontSize: 16, lineHeight: 24, color: semantic.text },
  small: { fontSize: 14, lineHeight: 20, color: semantic.text },
  muted: { color: semantic.textMuted },
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  notice: { borderWidth: 1, borderRadius: 10, padding: 12 },
  button: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  off: { opacity: 0.55 },
  field: { gap: 6 },
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    borderRadius: 10,
    backgroundColor: semantic.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: semantic.text,
  },
  toggle: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 48 },
  toggleText: { flex: 1, gap: 4 },
  box: {
    width: 28,
    height: 28,
    marginTop: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.neutral[500],
    backgroundColor: semantic.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { borderColor: semantic.primary, backgroundColor: semantic.primary },
  boxMark: { width: 12, height: 12, borderRadius: 2, backgroundColor: semantic.onPrimary },
});
