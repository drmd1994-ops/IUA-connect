import { ApiError, type components } from '@iua/api-client';
import { colors, semantic } from '@iua/ui-tokens';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Body, Button, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Markdown } from '@/ui/markdown';
import { sizeParts, useFileUrl, useSignFile } from './files';

type List = components['schemas']['PublicNewsListDto'];
type Item = List['items'][number];
type Category = components['schemas']['NewsCategoryListDto']['items'][number];
type Article = components['schemas']['PublicNewsDto'];
type Attachment = Article['attachments'][number];

const PAGE_SIZE = 10;

/** The news list. A member also sees what their membership opens; the API decides. */
export function NewsList() {
  const all = useTranslations();
  const t = useTranslations('content.news');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const { request } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState('');
  const [pages, setPages] = useState(1);
  const [list, setList] = useState<{ key: string; items: Item[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${locale}:${category}`;

  useEffect(() => {
    let active = true;
    request<{ items: Category[] }>('/api/v1/news/categories')
      .then((result) => active && setCategories(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({
      locale,
      page: String(pages),
      pageSize: String(PAGE_SIZE),
      ...(category ? { category } : {}),
    });
    request<List>(`/api/v1/news?${query.toString()}`)
      .then((result) => {
        if (!active) return;
        setError(null);
        // A further page is added to what is shown; a new language or category starts afresh.
        setList((current) => ({
          key,
          total: result.total,
          items:
            pages > 1 && current?.key === key ? [...current.items, ...result.items] : result.items,
        }));
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, locale, category, pages, key]);

  const shown = list?.key === key ? list : null;
  const choose = (next: string) => {
    setCategory(next);
    setPages(1);
  };
  return (
    <Screen>
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('category')}
        >
          <Chip label={t('allCategories')} selected={category === ''} onPress={() => choose('')} />
          {categories.map((c) => (
            <Chip
              key={c.key}
              label={locale === 'he' ? c.nameHe : c.nameEn}
              selected={category === c.key}
              onPress={() => choose(c.key)}
            />
          ))}
        </ScrollView>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!shown && error === null && <Body muted>{m('loading')}</Body>}
      {shown?.items.length === 0 && <Body muted>{t('empty')}</Body>}
      {shown?.items.map((item) => (
        <NewsCard key={item.slug} item={item} />
      ))}
      {shown && shown.items.length > 0 && (
        <Body muted>{m('news.shown', { shown: shown.items.length, total: shown.total })}</Body>
      )}
      {shown && shown.items.length < shown.total && (
        <Button label={m('news.more')} variant="secondary" onPress={() => setPages((n) => n + 1)} />
      )}
    </Screen>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** One item of the list; the whole card opens it. */
function NewsCard({ item }: { item: Item }) {
  const t = useTranslations('content');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const thumb = useFileUrl(item.featuredImageFileId, 'thumb');
  const category = item.category
    ? locale === 'he'
      ? item.category.nameHe
      : item.category.nameEn
    : null;
  return (
    <Pressable
      onPress={() => router.push(`/news/${encodeURIComponent(item.slug)}`)}
      accessibilityRole="link"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {item.featuredImageFileId &&
        (thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={styles.thumb} />
        ))}
      <View style={styles.cardText}>
        <Text style={styles.meta}>
          {format.dateTime(new Date(item.date), { dateStyle: 'long' })}
          {category ? ` · ${category}` : ''}
        </Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
        {item.sourceUrl ? <Text style={styles.meta}>{t('news.sourceLabel')}</Text> : null}
        {item.accessTier !== 'PUBLIC' && (
          <Text style={styles.tier}>{t('common.tiers.MEMBERS')}</Text>
        )}
      </View>
    </Pressable>
  );
}

/** One news item: its text, picture, files and references. */
export function NewsArticle({ slug }: { slug: string }) {
  const all = useTranslations();
  const t = useTranslations('content');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [found, setFound] = useState<{ key: string; article: Article } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const key = `${slug}:${locale}`;

  useEffect(() => {
    let active = true;
    request<Article>(`/api/v1/news/${encodeURIComponent(slug)}?locale=${locale}`)
      .then((article) => {
        if (!active) return;
        setError(null);
        setFound({ key, article });
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, slug, locale, key]);

  const article = found?.key === key ? found.article : null;
  const back = (
    <Button label={t('news.back')} variant="link" onPress={() => router.navigate('/news')} />
  );
  if (error !== null) {
    const missing = error instanceof ApiError && error.code === 'NOT_FOUND';
    return (
      <Screen>
        {back}
        {missing ? (
          <>
            <Title>{t('common.notFoundTitle')}</Title>
            <Body muted>{t('common.notFoundBody')}</Body>
          </>
        ) : (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        )}
      </Screen>
    );
  }
  if (!article) {
    return (
      <Screen>
        {back}
        <Body muted>{m('loading')}</Body>
      </Screen>
    );
  }
  const category = article.category
    ? locale === 'he'
      ? article.category.nameHe
      : article.category.nameEn
    : null;
  return (
    <Screen>
      {back}
      {article.archived && <Notice tone="warning">{t('news.archivedNotice')}</Notice>}
      {article.fallback && <Notice>{t('common.fallbackNotice')}</Notice>}
      <Text style={styles.meta}>
        {format.dateTime(new Date(article.date), { dateStyle: 'long' })}
        {category ? ` · ${category}` : ''}
        {article.accessTier !== 'PUBLIC' ? ` · ${t('common.tiers.MEMBERS')}` : ''}
      </Text>
      <Title>{article.title}</Title>
      {article.author ? <Body muted>{t('news.by', { author: article.author })}</Body> : null}
      {article.featuredImageFileId && (
        <Picture
          fileId={article.featuredImageFileId}
          label={t('news.imageAlt', { title: article.title })}
        />
      )}
      {article.summary ? <Text style={styles.lead}>{article.summary}</Text> : null}
      <Markdown>{article.body}</Markdown>

      {article.attachments.length > 0 && (
        <View style={styles.section}>
          <Heading>{t('news.attachments')}</Heading>
          {article.attachments.map((file) => (
            <AttachmentLink key={file.id} file={file} />
          ))}
        </View>
      )}

      {article.references.length > 0 && (
        <View style={styles.section}>
          <Heading>{t('news.references')}</Heading>
          {article.references.map((reference, index) => (
            <Button
              key={reference.url}
              label={`${index + 1}. ${reference.title}`}
              variant="link"
              hint={m('news.fileHint')}
              onPress={() => void Linking.openURL(reference.url).catch(() => undefined)}
            />
          ))}
        </View>
      )}

      {article.sourceUrl && (
        <View style={styles.source}>
          <Text style={styles.meta}>{t('news.sourceLabel')}</Text>
          <Button
            label={t('news.readAtSource')}
            variant="link"
            hint={m('news.fileHint')}
            onPress={() => void Linking.openURL(article.sourceUrl ?? '').catch(() => undefined)}
          />
        </View>
      )}
    </Screen>
  );
}

function Picture({ fileId, label }: { fileId: string; label: string }) {
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

/** A file of the item. Its signed address lives five minutes, so it is asked for when pressed. */
function AttachmentLink({ file }: { file: Attachment }) {
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
  card: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.8 },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.neutral[100] },
  cardText: { padding: 16, gap: 6 },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  cardTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    color: semantic.primary,
    textDecorationLine: 'underline',
  },
  summary: { fontSize: 16, lineHeight: 24, color: semantic.textMuted },
  tier: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: semantic.textMuted,
    backgroundColor: colors.neutral[100],
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  lead: { fontSize: 18, lineHeight: 28, color: semantic.textMuted },
  picture: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: colors.neutral[100],
  },
  section: { gap: 4 },
  source: { borderWidth: 1, borderColor: semantic.border, borderRadius: 10, padding: 12 },
});
