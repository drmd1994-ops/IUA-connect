import {
  MAX_ATTACHMENTS,
  MESSAGE_MAX_LENGTH,
  type Message,
  REACTIONS,
  REACTION_EMOJI,
  type Reaction,
  canAttach,
  mentionAt,
  messageParts,
  personName,
} from '@medconnect/api-client/chat';
import type { components } from '@medconnect/api-client';
import { colors, semantic } from '@medconnect/ui-tokens';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useFileUrl, useSignFile } from '@/features/files';
import { useSession } from '@/session/session-provider';
import { Button, Notice, Toggle } from '@/ui/kit';
import { FileLink } from '@/ui/parts';
import { type PickedFile, attachmentKind, fileName } from './model';
import { type Person } from './ui';

type FileDto = components['schemas']['FileDto'];
type Attachment = Message['attachments'][number];

/** A message's text: web addresses open in the phone's browser, mentions stand out. */
export function MessageText({ message }: { message: Message }) {
  const names = message.mentions.map((person) => personName(person) ?? '');
  return (
    <Text style={styles.text} selectable>
      {messageParts(message.body, names).map((part, index) =>
        part.kind === 'link' ? (
          <Text
            key={index}
            accessibilityRole="link"
            style={styles.link}
            onPress={() => void Linking.openURL(part.text).catch(() => undefined)}
          >
            {part.text}
          </Text>
        ) : part.kind === 'mention' ? (
          <Text key={index} style={styles.mention}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

/** The files of a message: a picture is shown, a document or a video opens in the browser. */
export function Attachments({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <View style={styles.files}>
      {files.map((file) =>
        file.kind === 'IMAGE' ? (
          <Picture key={file.id} file={file} />
        ) : (
          <FileLink
            key={file.id}
            file={{ id: file.id, originalName: file.name, sizeBytes: file.sizeBytes }}
          />
        ),
      )}
    </View>
  );
}

function Picture({ file }: { file: Attachment }) {
  const t = useTranslations('groups.files');
  const thumb = useFileUrl(file.id, 'thumb');
  const sign = useSignFile();
  const ratio = file.width && file.height ? file.width / file.height : 4 / 3;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={t('openName', { name: file.name })}
      onPress={() =>
        void sign(file.id)
          .then((url) => Linking.openURL(url))
          .catch(() => undefined)
      }
    >
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          style={[styles.picture, { aspectRatio: ratio }]}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.picture, { aspectRatio: ratio }]} />
      )}
    </Pressable>
  );
}

/** The reactions under a message; pressing one adds or takes back the reader's own. */
export function ReactionChips({
  reactions,
  onToggle,
}: {
  reactions: Message['reactions'];
  onToggle: ((reaction: Reaction, on: boolean) => void) | null;
}) {
  const t = useTranslations('rooms.reactions');
  if (reactions.length === 0) return null;
  return (
    <View style={styles.reactions} accessibilityLabel={t('group')}>
      {reactions.map((item) => (
        <Pressable
          key={item.reaction}
          disabled={!onToggle}
          onPress={() => onToggle?.(item.reaction, !item.mine)}
          accessibilityRole="button"
          accessibilityState={{ selected: item.mine }}
          accessibilityLabel={t(item.mine ? 'yours' : 'count', {
            name: t(item.reaction),
            count: item.count,
          })}
          style={[styles.reaction, item.mine && styles.reactionMine]}
        >
          <Text style={styles.reactionText}>
            {`${REACTION_EMOJI[item.reaction]} ${item.count}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The six reactions, to choose one from the message's panel. */
export function ReactionPicker({
  message,
  onPick,
}: {
  message: Message;
  onPick: (reaction: Reaction, on: boolean) => void;
}) {
  const t = useTranslations('rooms.reactions');
  return (
    <View style={styles.reactions} accessibilityLabel={t('add')}>
      {REACTIONS.map((reaction) => {
        const mine = message.reactions.some((item) => item.reaction === reaction && item.mine);
        return (
          <Pressable
            key={reaction}
            onPress={() => onPick(reaction, !mine)}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            accessibilityLabel={t(reaction)}
            style={[styles.pick, mine && styles.reactionMine]}
          >
            <Text style={styles.pickText}>{REACTION_EMOJI[reaction]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface Chosen {
  file: FileDto;
}

/**
 * Where a message is written. Files are picked one at a time and uploaded at once; the message
 * then carries their ids. In a group or a room, "@" and a name mentions someone who is in it.
 */
export function Composer({
  initial = '',
  banner,
  saving = false,
  attach,
  announce = false,
  findPeople,
  onCancel,
  onSend,
  onTyping,
}: {
  initial?: string;
  /** What is being done, when it is not a plain new message: replying, or editing. */
  banner: string | null;
  /** Editing: the button saves, and nothing else can be added. */
  saving?: boolean;
  attach: boolean;
  /** A room's moderator may send an announcement. */
  announce?: boolean;
  /** Looks for people to mention; absent in a private conversation. */
  findPeople?: (query: string) => Promise<Person[]>;
  onCancel: () => void;
  onSend: (
    text: string,
    extra: { mentions: string[]; attachmentIds: string[]; announcement: boolean },
  ) => Promise<void>;
  onTyping: (() => void) | null;
}) {
  const all = useTranslations();
  const t = useTranslations('chat.composer');
  const r = useTranslations('rooms.composer');
  const f = useTranslations('groups.files');
  const m = useTranslations('mobile.chat');
  const { request } = useSession();
  const [text, setText] = useState(initial);
  const [caret, setCaret] = useState(initial.length);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const [mentioned, setMentioned] = useState<{ id: string; name: string }[]>([]);
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastTyping, setLastTyping] = useState(0);

  const mention = findPeople ? mentionAt(text, caret) : null;
  const query = mention?.query ?? '';
  useEffect(() => {
    if (!findPeople || query.length === 0) return;
    let active = true;
    findPeople(query)
      .then((people) => active && setSuggestions(people))
      .catch(() => active && setSuggestions([]));
    return () => {
      active = false;
    };
  }, [findPeople, query]);

  function choose(person: Person) {
    const name = personName(person);
    if (!mention || !person.id || !name) return;
    const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`;
    setText(next);
    setCaret(mention.start + name.length + 2);
    setMentioned((current) => [
      ...current.filter((x) => x.id !== person.id),
      { id: person.id!, name },
    ]);
    setSuggestions([]);
  }

  async function upload(picked: PickedFile) {
    setProblem(null);
    const kind = attachmentKind(picked.mimeType);
    if (!kind) return setProblem(f('typeNotAllowed'));
    if (
      !canAttach(
        chosen.map((item) => item.file),
        kind,
      )
    )
      return setProblem(f('tooMany'));
    setUploading(picked.name);
    try {
      const form = new FormData();
      // The phone's own way of naming a file on disk for an upload.
      form.append('file', {
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType,
      } as unknown as Blob);
      const file = await request<FileDto>('/api/v1/chat/attachments', {
        method: 'POST',
        body: form,
      });
      setChosen((current) => [...current, { file }]);
    } catch (caught) {
      setError(caught);
    } finally {
      setUploading(null);
    }
  }

  async function pick(source: 'library' | 'camera' | 'document') {
    setError(null);
    setProblem(null);
    try {
      if (source === 'document') {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        });
        const asset = result.canceled ? null : result.assets[0];
        if (asset) {
          const mimeType = asset.mimeType ?? 'application/pdf';
          await upload({
            uri: asset.uri,
            mimeType,
            name: fileName(asset.uri, mimeType, asset.name),
          });
        }
        return;
      }
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return setProblem(m('noCamera'));
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: source === 'camera' ? ['images'] : ['images', 'videos'],
        quality: 0.9,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        const mimeType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        await upload({
          uri: asset.uri,
          mimeType,
          name: fileName(asset.uri, mimeType, asset.fileName),
        });
      }
    } catch (caught) {
      setError(caught);
    }
  }

  const trimmed = text.trim();
  const ready = (trimmed.length > 0 || chosen.length > 0) && uploading === null;
  async function send() {
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await onSend(trimmed, {
        mentions: mentioned.filter((x) => trimmed.includes(`@${x.name}`)).map((x) => x.id),
        attachmentIds: chosen.map((item) => item.file.id),
        announcement,
      });
      setText('');
      setChosen([]);
      setMentioned([]);
      setAnnouncement(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const left = MESSAGE_MAX_LENGTH - text.length;
  return (
    <View style={styles.composer}>
      {banner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          <Button label={t('cancel')} variant="link" onPress={onCancel} />
        </View>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {problem && <Notice tone="warning">{problem}</Notice>}
      {mention && suggestions.length > 0 && (
        <View style={styles.suggestions} accessibilityLabel={r('suggestions')}>
          {suggestions.slice(0, 5).map((person) => (
            <Button
              key={person.id}
              label={r('mention', { name: personName(person) ?? '' })}
              variant="secondary"
              onPress={() => choose(person)}
            />
          ))}
        </View>
      )}
      {chosen.length > 0 && (
        <View style={styles.chosen} accessibilityLabel={f('chosen')}>
          {chosen.map((item) => (
            <Button
              key={item.file.id}
              label={f('removeName', { name: item.file.originalName })}
              variant="secondary"
              onPress={() => setChosen((current) => current.filter((x) => x !== item))}
            />
          ))}
        </View>
      )}
      {uploading && <Text style={styles.note}>{f('uploading', { name: uploading })}</Text>}
      <TextInput
        value={text}
        onChangeText={(next) => {
          setText(next);
          const now = Date.now();
          if (onTyping && next.length > 0 && now - lastTyping > 3000) {
            setLastTyping(now);
            onTyping();
          }
        }}
        onSelectionChange={(event) => setCaret(event.nativeEvent.selection.end)}
        multiline
        maxLength={MESSAGE_MAX_LENGTH}
        accessibilityLabel={t('label')}
        placeholder={t('placeholder')}
        placeholderTextColor={colors.neutral[500]}
        style={styles.input}
      />
      {left <= 200 && <Text style={styles.note}>{t('left', { count: left })}</Text>}
      {announce && !saving && (
        <Toggle label={r('announcement')} value={announcement} onChange={setAnnouncement} />
      )}
      <View style={styles.actions}>
        {attach && !saving && chosen.length < MAX_ATTACHMENTS && (
          <>
            <Button
              label={m('pickPhoto')}
              variant="secondary"
              onPress={() => void pick('library')}
            />
            <Button
              label={m('pickCamera')}
              variant="secondary"
              onPress={() => void pick('camera')}
            />
            <Button
              label={m('pickPdf')}
              variant="secondary"
              onPress={() => void pick('document')}
            />
          </>
        )}
        <Button
          label={saving ? t('save') : t('send')}
          pending={pending}
          disabled={!ready}
          onPress={() => void send()}
        />
      </View>
      <Text style={styles.note}>
        {attach && !saving ? `${t('patientNote')} ${f('patientNote')}` : t('patientNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 16, lineHeight: 24, color: semantic.text },
  link: { color: semantic.primary, textDecorationLine: 'underline' },
  mention: { color: colors.brand[800], fontWeight: '700' },
  files: { gap: 6, marginTop: 4 },
  picture: { width: 220, maxWidth: '100%', borderRadius: 8, backgroundColor: colors.neutral[100] },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reaction: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    justifyContent: 'center',
  },
  reactionMine: { borderColor: semantic.primary, backgroundColor: colors.brand[50] },
  reactionText: { fontSize: 14, color: semantic.text },
  pick: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickText: { fontSize: 22 },
  composer: {
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    backgroundColor: semantic.background,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderStartWidth: 3,
    borderStartColor: semantic.primary,
    paddingStart: 8,
  },
  bannerText: { flex: 1, fontSize: 14, color: semantic.textMuted },
  suggestions: { gap: 6 },
  chosen: { gap: 6 },
  input: {
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    borderRadius: 10,
    backgroundColor: semantic.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: semantic.text,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  note: { fontSize: 13, lineHeight: 18, color: semantic.textMuted },
});
