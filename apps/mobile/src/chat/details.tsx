import type { components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Body, Button, Field, Notice } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { PeopleSearch, ReportSheet, type ReportTarget } from './dialogs';
import { type Thread, threadPath } from './model';
import { Avatar, Confirm, type Person, Row, Sheet, usePersonLabel, useSend } from './ui';

type Schemas = components['schemas'];
type Member = Person & { role: 'MEMBER' | 'ADMIN' | 'MODERATOR' };
type Ban = Schemas['RoomBanListDto']['items'][number];
type Mute = 'off' | '8h' | 'week' | 'forever';
type Ask =
  | { kind: 'block' | 'leave' }
  | { kind: 'remove' | 'handOver'; person: Member }
  | { kind: 'report'; target: ReportTarget };

/**
 * What the reader can do with a thread as a whole: notices, pinning, leaving, and, for whoever
 * runs a group or moderates a room, managing it.
 */
export function ThreadDetails({
  thread,
  title,
  onClose,
  onChanged,
  onSearch,
  onLeft,
}: {
  thread: Thread;
  title: string;
  onClose: () => void;
  onChanged: () => void;
  /** The reader is no longer here (left, or marked it unread): back to the list. */
  /** Search in this thread. */
  onSearch: () => void;
  onLeft: () => void;
}) {
  const all = useTranslations();
  const c = useTranslations('chat');
  const g = useTranslations('groups');
  const r = useTranslations('rooms');
  const locale = useLocale();
  const format = useFormatter();
  const label = usePersonLabel();
  const { request } = useSession();
  const send = useSend();
  const { kind, detail } = thread;
  const base = threadPath(kind, detail.id);
  const [members, setMembers] = useState<Member[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [name, setName] = useState(kind === 'group' ? thread.detail.name : '');
  const [lockFor, setLockFor] = useState<'open' | '60' | '1440'>('open');
  const [invited, setInvited] = useState<string[]>([]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const canModerate = kind === 'room' && thread.detail.canModerate;
  const runsGroup = kind === 'group' && thread.detail.role === 'ADMIN';

  useEffect(() => {
    if (kind === 'direct') return;
    let active = true;
    request<{ items: Member[] }>(`${base}/members`)
      .then((result) => active && setMembers(result.items))
      .catch(() => undefined);
    if (canModerate) {
      request<{ items: Ban[] }>(`${base}/bans`)
        .then((result) => active && setBans(result.items))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [request, base, kind, canModerate, version]);

  /** Sends a change; its error is shown in the panel. Answers whether it worked. */
  const act = useCallback(
    async (work: () => Promise<unknown>) => {
      setError(null);
      try {
        await work();
        onChanged();
        setVersion((v) => v + 1);
        return true;
      } catch (caught) {
        setError(caught);
        return false;
      }
    },
    [onChanged],
  );
  const mine = (body: object) => act(() => send('PATCH', `${base}/me`, body));

  const muteText = kind === 'direct' ? c : kind === 'group' ? null : r;
  const muteLabel = (key: 'muteLabel' | 'muteOff' | 'mute8h' | 'muteWeek' | 'muteForever') =>
    key === 'muteLabel' && kind === 'group'
      ? g('details.muteLabel')
      : (muteText ?? r)(`details.${key}`);
  const muted: Mute | 'timed' = detail.muted ? (detail.mutedUntil ? 'timed' : 'forever') : 'off';
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const other = kind === 'direct' ? thread.detail.other : null;

  return (
    <Sheet
      title={
        kind === 'direct'
          ? c('details.title')
          : kind === 'group'
            ? g('details.title')
            : r('details.title')
      }
      onClose={onClose}
    >
      <Text style={styles.name}>{title}</Text>
      {kind === 'room' && (
        <>
          {((locale === 'en' ? thread.detail.descriptionEn : null) ??
          thread.detail.descriptionHe) ? (
            <Body>
              {(locale === 'en' ? thread.detail.descriptionEn : null) ??
                thread.detail.descriptionHe}
            </Body>
          ) : null}
          <Body muted>{r('list.members', { count: thread.detail.memberCount })}</Body>
          {thread.detail.inviteOnly && <Tag>{g('room.inviteOnly')}</Tag>}
        </>
      )}
      {kind === 'group' && <Body muted>{g('details.staffNote')}</Body>}
      {other?.id && !other.listed && <Body muted>{c('details.notListed')}</Body>}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}

      <Text style={styles.label}>{muteLabel('muteLabel')}</Text>
      {muted === 'timed' && detail.mutedUntil && (
        <Body muted>
          {(muteText ?? r)('details.mutedUntil', { when: when(detail.mutedUntil) })}
        </Body>
      )}
      <Choices<Mute>
        label={muteLabel('muteLabel')}
        value={muted === 'timed' ? '8h' : muted}
        onChange={(mute) => void mine({ mute })}
        options={[
          { value: 'off', label: muteLabel('muteOff') },
          { value: '8h', label: muteLabel('mute8h') },
          { value: 'week', label: muteLabel('muteWeek') },
          { value: 'forever', label: muteLabel('muteForever') },
        ]}
      />
      <Row
        label={detail.pinned ? g('details.unpin') : g('details.pin')}
        onPress={() => void mine({ pinned: !detail.pinned })}
      />
      <Row
        label={
          kind === 'direct'
            ? c('details.search')
            : kind === 'group'
              ? g('details.search')
              : r('details.search')
        }
        onPress={onSearch}
      />
      <Row
        label={c('details.markUnread')}
        // Leaving the thread, or opening it would read it again at once.
        onPress={() => void mine({ markedUnread: true }).then((done) => done && onLeft())}
      />
      {kind !== 'room' && (
        <Row
          label={thread.detail.archived ? c('details.unarchive') : c('details.archive')}
          onPress={() => void mine({ archived: !thread.detail.archived })}
        />
      )}

      {other?.id &&
        (kind === 'direct' && thread.detail.blockedByMe ? (
          <Row
            label={c('details.unblock')}
            onPress={() =>
              void act(() =>
                send('DELETE', `/api/v1/chat/blocks/${encodeURIComponent(other.id ?? '')}`),
              )
            }
          />
        ) : (
          <Row label={c('details.block')} danger onPress={() => setAsk({ kind: 'block' })} />
        ))}
      {other?.id && (
        <Row
          label={c('details.report')}
          danger
          onPress={() =>
            setAsk({ kind: 'report', target: { userId: other.id ?? '', name: title } })
          }
        />
      )}

      {runsGroup && (
        <View style={styles.group}>
          <Field label={g('details.rename')} value={name} onChangeText={setName} maxLength={80} />
          <Button
            label={g('details.renameSave')}
            variant="secondary"
            disabled={name.trim().length === 0 || name.trim() === thread.detail.name}
            onPress={() => void act(() => send('PATCH', base, { name: name.trim() }))}
          />
          <Text style={styles.label}>{g('details.invite')}</Text>
          <PeopleSearch
            path={`/api/v1/chat/invitable?conversationId=${encodeURIComponent(detail.id)}`}
            exclude={invited}
            actionLabel={(person) => g('create.addName', { name: person })}
            onPick={(person) =>
              void act(() => send('POST', `${base}/invitations`, { userIds: [person.id] })).then(
                (done) => done && person.id && setInvited((current) => [...current, person.id!]),
              )
            }
          />
        </View>
      )}

      {kind !== 'direct' && (
        <View style={styles.group}>
          <Text style={styles.label}>
            {kind === 'group' ? g('details.members') : r('details.members')}
          </Text>
          {kind === 'room' && thread.detail.moderators.length === 0 && (
            <Body muted>{r('details.noModerators')}</Body>
          )}
          {members.map((person, index) => (
            <View key={person.id ?? index} style={styles.person}>
              <Avatar person={person} size={36} />
              <Text style={styles.personName}>{label(person)}</Text>
              {person.role === 'ADMIN' && <Tag>{g('group.admin')}</Tag>}
              {person.role === 'MODERATOR' && <Tag>{r('room.moderator')}</Tag>}
              {runsGroup && person.id && person.role !== 'ADMIN' && (
                <>
                  <Button
                    label={g('details.makeAdminName', { name: label(person) })}
                    variant="link"
                    onPress={() => setAsk({ kind: 'handOver', person })}
                  />
                  <Button
                    label={g('details.removeName', { name: label(person) })}
                    variant="link"
                    onPress={() => setAsk({ kind: 'remove', person })}
                  />
                </>
              )}
            </View>
          ))}
        </View>
      )}

      {(runsGroup ||
        (kind === 'room' &&
          canModerate &&
          thread.detail.inviteOnly &&
          !thread.detail.archived)) && (
        <View style={styles.group}>
          {kind === 'room' && (
            <>
              <Text style={styles.label}>{g('room.invite')}</Text>
              <Body muted>{g('room.inviteNote')}</Body>
              <PeopleSearch
                path={`/api/v1/chat/invitable?conversationId=${encodeURIComponent(detail.id)}`}
                exclude={invited}
                actionLabel={(person) => g('create.addName', { name: person })}
                onPick={(person) =>
                  void act(() =>
                    send('POST', `${base}/invitations`, { userIds: [person.id] }),
                  ).then(
                    (done) =>
                      done && person.id && setInvited((current) => [...current, person.id!]),
                  )
                }
              />
            </>
          )}
          <Waiting base={base} version={version} onError={setError} />
        </View>
      )}
      {canModerate && (
        <View style={styles.group}>
          <Text style={styles.label}>{r('moderate.title')}</Text>
          {thread.detail.locked ? (
            <Row
              label={r('moderate.unlock')}
              onPress={() => void act(() => send('POST', `${base}/unlock`))}
            />
          ) : (
            <>
              <Choices
                label={r('moderate.lockFor')}
                value={lockFor}
                onChange={setLockFor}
                options={[
                  { value: 'open', label: r('moderate.lockOpen') },
                  { value: '60', label: r('moderate.lock1h') },
                  { value: '1440', label: r('moderate.lock1d') },
                ]}
              />
              <Row
                label={r('moderate.lock')}
                onPress={() =>
                  void act(() =>
                    send('POST', `${base}/lock`, {
                      minutes: lockFor === 'open' ? null : Number(lockFor),
                    }),
                  )
                }
              />
            </>
          )}
          <Text style={styles.label}>{r('moderate.bans')}</Text>
          {bans.every((ban) => !ban.active) && <Body muted>{r('moderate.noBans')}</Body>}
          {bans
            .filter((ban) => ban.active)
            .map((ban) => (
              <View key={ban.id} style={styles.person}>
                <Text style={styles.personName}>
                  {`${label(ban.user)} · ${
                    ban.endsAt
                      ? r('moderate.banUntil', { when: when(ban.endsAt) })
                      : r('moderate.banOpen')
                  }`}
                </Text>
                <Button
                  label={r('moderate.liftName', { name: label(ban.user) })}
                  variant="link"
                  onPress={() =>
                    void act(() => send('POST', `${base}/bans/${encodeURIComponent(ban.id)}/lift`))
                  }
                />
              </View>
            ))}
        </View>
      )}

      {kind === 'room' && (
        <Row
          label={r('details.report')}
          danger
          onPress={() => setAsk({ kind: 'report', target: { roomId: detail.id, name: title } })}
        />
      )}
      {kind === 'group' && (
        <Row label={g('details.leave')} danger onPress={() => setAsk({ kind: 'leave' })} />
      )}
      {kind === 'room' && thread.detail.role !== 'NONE' && (
        <Row label={r('details.leave')} danger onPress={() => setAsk({ kind: 'leave' })} />
      )}

      {ask?.kind === 'block' && other?.id && (
        <Confirm
          title={c('confirm.blockTitle', { name: title })}
          text={c('confirm.blockText')}
          confirmLabel={c('confirm.block')}
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            await send('POST', '/api/v1/chat/blocks', { userId: other.id });
            onChanged();
          }}
        />
      )}
      {ask?.kind === 'leave' && (
        <Confirm
          title={
            kind === 'group'
              ? g('details.leaveTitle', { name: title })
              : r('leave.title', { name: title })
          }
          text={
            kind === 'group'
              ? g(runsGroup ? 'details.leaveAdminText' : 'details.leaveText')
              : r('leave.text')
          }
          confirmLabel={kind === 'group' ? g('details.leaveConfirm') : r('leave.confirm')}
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            await send('POST', `${base}/leave`);
            onLeft();
          }}
        />
      )}
      {ask?.kind === 'remove' && (
        <Confirm
          title={g('details.removeTitle', { name: label(ask.person) })}
          text={g('details.removeText')}
          confirmLabel={g('details.remove')}
          onClose={() => setAsk(null)}
          onConfirm={() =>
            act(() =>
              send('POST', `${base}/members/${encodeURIComponent(ask.person.id ?? '')}/remove`),
            )
          }
        />
      )}
      {ask?.kind === 'handOver' && (
        <Confirm
          title={g('details.makeAdminTitle', { name: label(ask.person) })}
          text={g('details.makeAdminText')}
          confirmLabel={g('details.makeAdminConfirm')}
          danger={false}
          onClose={() => setAsk(null)}
          onConfirm={() => act(() => send('POST', `${base}/admin`, { userId: ask.person.id }))}
        />
      )}
      {ask?.kind === 'report' && <ReportSheet target={ask.target} onClose={() => setAsk(null)} />}
    </Sheet>
  );
}

/** Invitations sent from here that nobody answered yet; each can be taken back. */
function Waiting({
  base,
  version,
  onError,
}: {
  base: string;
  version: number;
  onError: (error: unknown) => void;
}) {
  const g = useTranslations('groups.details');
  const label = usePersonLabel();
  const { request } = useSession();
  const send = useSend();
  const [items, setItems] = useState<{ id: string; user: Person }[]>([]);
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    let active = true;
    request<{ items: { id: string; user: Person }[] }>(`${base}/invitations`)
      .then((result) => active && setItems(result.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, base, version, taken]);

  return (
    <>
      <Text style={styles.label}>{g('waiting')}</Text>
      {items.length === 0 && <Body muted>{g('noWaiting')}</Body>}
      {items.map((item) => (
        <View key={item.id} style={styles.person}>
          <Text style={styles.personName}>{label(item.user)}</Text>
          <Button
            label={g('withdrawName', { name: label(item.user) })}
            variant="link"
            onPress={() =>
              void send('DELETE', `/api/v1/chat/invitations/${encodeURIComponent(item.id)}`)
                .then(() => setTaken((n) => n + 1))
                .catch(onError)
            }
          />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 18, fontWeight: '600', color: semantic.text },
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  group: { gap: 8, borderTopWidth: 1, borderTopColor: semantic.border, paddingTop: 12 },
  person: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  personName: { flex: 1, minWidth: 120, fontSize: 16, color: semantic.text },
});
