import { colors, semantic } from '@iua/ui-tokens';
import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { type Inline, parseMarkdown } from '@/features/markdown-model';

/**
 * Draws an article body. The text becomes the phone's own text elements, never HTML; a link
 * opens in the phone's browser.
 */
export function Markdown({ children }: { children: string }) {
  const blocks = useMemo(() => parseMarkdown(children), [children]);
  return (
    <View style={styles.body}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <Text key={index} accessibilityRole="header" style={headings[block.level]}>
                <Spans parts={block.inline} />
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={index} style={styles.text}>
                <Spans parts={block.inline} />
              </Text>
            );
          case 'quote':
            return (
              <View key={index} style={styles.quote}>
                <Text style={[styles.text, styles.muted]}>
                  <Spans parts={block.inline} />
                </Text>
              </View>
            );
          case 'list':
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={styles.item}>
                    <Text style={styles.text}>{block.ordered ? `${itemIndex + 1}.` : '•'}</Text>
                    <Text style={[styles.text, styles.itemText]}>
                      <Spans parts={item} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'code':
            return (
              <Text key={index} style={styles.codeBlock}>
                {block.text}
              </Text>
            );
          case 'rule':
            return <View key={index} style={styles.rule} />;
        }
      })}
    </View>
  );
}

function Spans({ parts }: { parts: Inline[] }) {
  return parts.map((part, index) => {
    switch (part.kind) {
      case 'text':
        return part.text;
      case 'strong':
        return (
          <Text key={index} style={styles.strong}>
            {part.text}
          </Text>
        );
      case 'emphasis':
        return (
          <Text key={index} style={styles.emphasis}>
            {part.text}
          </Text>
        );
      case 'code':
        return (
          <Text key={index} style={styles.code}>
            {part.text}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={index}
            accessibilityRole="link"
            style={styles.link}
            onPress={() => void Linking.openURL(part.url).catch(() => undefined)}
          >
            {part.text}
          </Text>
        );
    }
  });
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  text: { fontSize: 16, lineHeight: 26, color: semantic.text },
  muted: { color: semantic.textMuted },
  strong: { fontWeight: '700' },
  emphasis: { fontStyle: 'italic' },
  code: { fontFamily: 'monospace', backgroundColor: colors.neutral[100] },
  link: { color: semantic.primary, fontWeight: '600', textDecorationLine: 'underline' },
  quote: { borderStartWidth: 4, borderStartColor: semantic.border, paddingStart: 12 },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 8 },
  itemText: { flex: 1 },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 20,
    color: semantic.text,
    backgroundColor: colors.neutral[100],
    borderRadius: 8,
    padding: 12,
  },
  rule: { height: 1, backgroundColor: semantic.border },
});

const headings = StyleSheet.create({
  2: { fontSize: 22, fontWeight: '600', color: colors.brand[900], marginTop: 8 },
  3: { fontSize: 19, fontWeight: '600', color: semantic.text, marginTop: 4 },
  4: { fontSize: 17, fontWeight: '600', color: semantic.text },
});
