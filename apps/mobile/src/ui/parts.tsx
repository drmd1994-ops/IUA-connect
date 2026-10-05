import { colors, semantic } from '@iua/ui-tokens';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { sizeParts, useFileUrl, useSignFile } from '@/features/files';
import { Button, Notice } from './kit';

/** Parts that more than one screen uses: a choice of one among a few, a picture, a file, a tag. */

/** One choice among a few, in a row that scrolls sideways when it is longer than the screen. */
export function Choices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** What is being chosen; said by a screen reader. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            style={[styles.chip, selected && styles.chipOn]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A stored picture at the screen's width. Until its address is known, an empty box of its size. */
export function Picture({ fileId, label }: { fileId: string; label: string }) {
  const url = useFileUrl(fileId);
  if (!url) return <View style={styles.picture} />;
  return (
    <Image
      source={{ uri: url }}
      style={styles.picture}
      contentFit="cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    />
  );
}

/** A stored file. Its signed address lives five minutes, so it is asked for when pressed. */
export function FileLink({
  file,
}: {
  file: { id: string; originalName: string; sizeBytes: number };
}) {
  const t = useTranslations('content.common');
  const m = useTranslations('mobile.news');
  const format = useFormatter();
  const sign = useSignFile();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const size = sizeParts(file.sizeBytes);
  const name = m(size.unit === 'mb' ? 'fileMb' : 'fileKb', {
    name: file.originalName,
    size: format.number(size.value, { maximumFractionDigits: 1 }),
  });

  async function open() {
    setPending(true);
    setFailed(false);
    try {
      await Linking.openURL(await sign(file.id));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        label={`${t('download')}: ${name}`}
        variant="link"
        hint={m('fileHint')}
        pending={pending}
        onPress={() => void open()}
      />
      {failed && <Notice tone="error">{m('fileFailed')}</Notice>}
    </>
  );
}

/** A short word about an item: "Members only", "Cancelled". */
export function Tag({
  children,
  tone = 'plain',
}: {
  children: string;
  tone?: 'plain' | 'danger' | 'success' | 'warning';
}) {
  return <Text style={[styles.tag, tagTones[tone]]}>{children}</Text>;
}

const tagTones = StyleSheet.create({
  plain: { color: semantic.textMuted, backgroundColor: colors.neutral[100] },
  danger: { color: colors.danger[700], backgroundColor: colors.danger[100] },
  success: { color: colors.success[700], backgroundColor: colors.success[100] },
  warning: { color: colors.warning[700], backgroundColor: colors.warning[100] },
});

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    backgroundColor: semantic.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: semantic.primary, borderColor: semantic.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: semantic.text },
  chipTextOn: { color: semantic.onPrimary },
  picture: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: colors.neutral[100],
  },
  tag: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
});
