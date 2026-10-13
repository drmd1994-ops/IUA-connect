import { ApiError, type components } from '@iua/api-client';
import { colors, semantic } from '@iua/ui-tokens';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title, Toggle } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { PROFILE_LANGUAGES, changedFields, groupSecret, textOrNull, toggle } from './account-model';
import { useFileUrl } from './files';
import { useHospitals, useLocalName, useSubspecialties } from './reference';

type Schemas = components['schemas'];
type Profile = Schemas['ProfileDto'];
type Visibility = Profile['visibility'];
type Level = Visibility['NAME'];
type Membership = Schemas['MyMembershipDto'];
type MfaStatus = Schemas['MfaStatusDto'];
type TotpSetup = Schemas['TotpSetupDto'];
type SessionItem = Schemas['SessionListDto']['sessions'][number];
type Department = Schemas['DepartmentListDto']['items'][number];

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined
    ? {}
    : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});
const TEXT_FIELDS = [
  ['names', ['firstName', 'lastName', 'nameHe', 'nameEn']],
  ['work', ['title', 'position']],
  ['about', ['bio', 'researchInterests', 'orcid']],
  ['contact', ['contactEmail', 'contactPhone']],
] as const;
type TextField = (typeof TEXT_FIELDS)[number][1][number];
const LEVELS: Level[] = ['PRIVATE', 'MEMBERS', 'PUBLIC'];

/** The member's professional details, and who may see each of them. */
export function ProfileScreen() {
  const all = useTranslations();
  const t = useTranslations('membership');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const hospitals = useHospitals();
  const subspecialties = useSubspecialties();
  const { request } = useSession();
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Profile>('/api/v1/me/profile')
      .then((profile) => {
        if (!active) return;
        setSaved(profile);
        setForm(profile);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const hospitalId = form?.hospitalId ?? null;
  useEffect(() => {
    if (!hospitalId) return;
    let active = true;
    request<{ items: Department[] }>(
      `/api/v1/hospitals/${encodeURIComponent(hospitalId)}/departments`,
    )
      .then((result) => active && setDepartments(result.items))
      .catch(() => active && setDepartments([]));
    return () => {
      active = false;
    };
  }, [request, hospitalId]);

  const change = (part: Partial<Profile>) => {
    setDone(false);
    setForm((current) => (current ? { ...current, ...part } : current));
  };

  async function save() {
    if (!form || !saved) return;
    setPending(true);
    setDone(false);
    setError(null);
    try {
      // The photo has its own requests; it is never part of this one.
      const { photoFileId: _before, ...before } = saved;
      const { photoFileId: _after, ...typed } = form;
      const after = { ...typed };
      for (const [, fields] of TEXT_FIELDS) {
        for (const field of fields) after[field] = textOrNull(after[field] ?? '');
      }
      const profile = await request<Profile>(
        '/api/v1/me/profile',
        json('PATCH', changedFields(before, after)),
      );
      setSaved(profile);
      setForm(profile);
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  if (!form) {
    return (
      <Screen>
        <Back />
        <Title>{t('profile.title')}</Title>
        {error !== null ? (
          <Notice tone="error">{errorMessage(error, all)}</Notice>
        ) : (
          <Body muted>{m('loading')}</Body>
        )}
      </Screen>
    );
  }
  return (
    <Screen>
      <Back />
      <Title>{t('profile.title')}</Title>
      <Body muted>{t('profile.intro')}</Body>
      <PhotoCard
        fileId={form.photoFileId}
        onChanged={(photoFileId) => {
          setForm((current) => (current ? { ...current, photoFileId } : current));
          setSaved((current) => (current ? { ...current, photoFileId } : current));
        }}
      />
      {TEXT_FIELDS.map(([section, fields]) => (
        <Card key={section}>
          <Heading>{t(`profile.sections.${section}`)}</Heading>
          {fields.map((field: TextField) => (
            <Field
              key={field}
              label={t(`profile.fields.${field}`)}
              hint={
                field === 'title' || field === 'orcid' ? t(`profile.hints.${field}`) : undefined
              }
              value={form[field] ?? ''}
              onChangeText={(value) => change({ [field]: value === '' ? null : value })}
              multiline={field === 'bio' || field === 'researchInterests'}
              autoCapitalize={field === 'contactEmail' || field === 'orcid' ? 'none' : 'sentences'}
              keyboardType={
                field === 'contactEmail'
                  ? 'email-address'
                  : field === 'contactPhone'
                    ? 'phone-pad'
                    : 'default'
              }
            />
          ))}
          {section === 'work' && (
            <>
              <Text style={styles.label}>{t('profile.fields.hospital')}</Text>
              <Choices
                label={t('profile.fields.hospital')}
                value={form.hospitalId ?? ''}
                onChange={(value) => change({ hospitalId: value || null, departmentId: null })}
                options={[
                  { value: '', label: t('profile.noHospital') },
                  ...hospitals.map((h) => ({ value: h.id, label: name(h) })),
                ]}
              />
              {form.hospitalId && departments.length > 0 && (
                <>
                  <Text style={styles.label}>{t('profile.fields.department')}</Text>
                  <Choices
                    label={t('profile.fields.department')}
                    value={form.departmentId ?? ''}
                    onChange={(value) => change({ departmentId: value || null })}
                    options={[
                      { value: '', label: t('profile.noHospital') },
                      ...departments.map((d) => ({ value: d.id, label: name(d) })),
                    ]}
                  />
                </>
              )}
              <Text style={styles.label}>{t('profile.fields.subspecialties')}</Text>
              {subspecialties.map((s) => (
                <Toggle
                  key={s.id}
                  label={name(s)}
                  value={form.subspecialtyIds.includes(s.id)}
                  onChange={() => change({ subspecialtyIds: toggle(form.subspecialtyIds, s.id) })}
                />
              ))}
            </>
          )}
          {section === 'about' && (
            <>
              <Text style={styles.label}>{t('profile.fields.languages')}</Text>
              <Body muted>{t('profile.hints.languages')}</Body>
              {PROFILE_LANGUAGES.map((code) => (
                <Toggle
                  key={code}
                  label={m(`languages.${code}`)}
                  value={form.languages.includes(code)}
                  onChange={() => change({ languages: toggle(form.languages, code) })}
                />
              ))}
            </>
          )}
        </Card>
      ))}
      <Card>
        <Heading>{t('visibility.label')}</Heading>
        {(Object.keys(form.visibility) as (keyof Visibility)[]).map((key) => (
          <View key={key} style={styles.group}>
            <Text style={styles.label}>{t(`profile.visibilityOf.${key}`)}</Text>
            <Choices<Level>
              label={`${t('visibility.label')}: ${t(`profile.visibilityOf.${key}`)}`}
              value={form.visibility[key]}
              onChange={(level) => change({ visibility: { ...form.visibility, [key]: level } })}
              options={LEVELS.map((value) => ({ value, label: t(`visibility.${value}`) }))}
            />
          </View>
        ))}
      </Card>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {done && <Notice tone="success">{t('profile.saved')}</Notice>}
      <Button label={t('common.save')} pending={pending} onPress={() => void save()} />
      <DirectoryCard />
    </Screen>
  );
}

function PhotoCard({
  fileId,
  onChanged,
}: {
  fileId: string | null;
  onChanged: (fileId: string | null) => void;
}) {
  const all = useTranslations();
  const t = useTranslations('content.photo');
  const { request } = useSession();
  const url = useFileUrl(fileId, 'thumb');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function act(work: () => Promise<{ photoFileId: string | null } | null>) {
    setPending(true);
    setError(null);
    try {
      const profile = await work();
      if (profile) onChanged(profile.photoFileId);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const choose = () =>
    act(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return null;
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      return request<Profile>('/api/v1/me/profile/photo', { method: 'PUT', body: form });
    });

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <Body muted>{t('intro')}</Body>
      {fileId && url ? (
        <Image
          source={{ uri: url }}
          style={styles.photo}
          contentFit="cover"
          accessible
          accessibilityLabel={t('alt')}
        />
      ) : (
        !fileId && <Body muted>{t('none')}</Body>
      )}
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      <Button
        label={t('choose')}
        variant="secondary"
        pending={pending}
        onPress={() => void choose()}
      />
      {fileId && (
        <Button
          label={t('remove')}
          variant="link"
          disabled={pending}
          onPress={() =>
            void act(async () => {
              await request('/api/v1/me/profile/photo', { method: 'DELETE' });
              return { photoFileId: null };
            })
          }
        />
      )}
    </Card>
  );
}

/** Being listed in the member directory is the member's own choice, and can be taken back. */
function DirectoryCard() {
  const all = useTranslations();
  const t = useTranslations('directory.optIn');
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [consent, setConsent] = useState<Schemas['ConsentsDto']['directory'] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Schemas['ConsentsDto']>('/api/v1/me/consents')
      .then((result) => active && setConsent(result.directory))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  async function set(granted: boolean) {
    setError(null);
    setMessage(null);
    try {
      const result = await request<Schemas['ConsentsDto']>(
        '/api/v1/me/consents',
        json('POST', { kind: 'DIRECTORY', granted }),
      );
      setConsent(result.directory);
      setMessage(t(granted ? 'joined' : 'left'));
    } catch (caught) {
      setError(caught);
    }
  }

  if (!consent) return null;
  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <Body muted>{t('explain')}</Body>
      <Body>
        {consent.granted && consent.grantedAt
          ? t('on', { date: format.dateTime(new Date(consent.grantedAt), { dateStyle: 'long' }) })
          : t('off')}
      </Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Button
        label={consent.granted ? t('leave') : t('join')}
        variant={consent.granted ? 'secondary' : 'primary'}
        onPress={() => void set(!consent.granted)}
      />
      <Button label={t('view')} variant="link" onPress={() => router.push('/members')} />
    </Card>
  );
}

/** The member's membership: its kind and state, and what happened to it over time. */
export function MembershipScreen() {
  const all = useTranslations();
  const t = useTranslations('membership.membership');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [mine, setMine] = useState<Membership | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Membership>('/api/v1/me/membership')
      .then((result) => active && setMine(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request]);

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  const membership = mine?.membership ?? null;
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!mine && error === null && <Body muted>{m('loading')}</Body>}
      {mine && !membership && <Body>{t('none')}</Body>}
      {membership && (
        <Card>
          <Fact label={t('type')} value={name(membership.type)} />
          <Fact label={t('status')} value={t(`statuses.${membership.status}`)} />
          <Fact label={t('validFrom')} value={date(membership.startDate)} />
          <Fact label={t('validUntil')} value={date(membership.endDate)} />
          <Fact label={t('payment')} value={t(`payments.${membership.paymentStatus}`)} />
          {membership.status === 'ACTIVE' && (
            <Button label={t('viewCard')} onPress={() => router.push('/card')} />
          )}
        </Card>
      )}
      {mine && mine.history.length > 0 && (
        <>
          <Heading>{t('historyTitle')}</Heading>
          {mine.history.map((entry, index) => (
            <Card key={`${entry.at}:${index}`}>
              <Text style={styles.strong}>{t(`events.${entry.event}`)}</Text>
              <Text style={styles.meta}>{date(entry.at)}</Text>
              {entry.reason ? <Body muted>{t('reason', { reason: entry.reason })}</Body> : null}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}

/**
 * A change that the server lets through only shortly after the person proved who they are. When
 * it answers "confirm it's you", the password is asked for and the change is tried once more.
 */
function useProtected() {
  const { request } = useSession();
  const [waiting, setWaiting] = useState<(() => Promise<void>) | null>(null);
  const run = useCallback(async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'REAUTHENTICATION_REQUIRED') {
        setWaiting(() => work);
        return;
      }
      throw caught;
    }
  }, []);
  const confirm = useCallback(
    async (password: string, code: string) => {
      await request(
        '/api/v1/auth/reauthenticate',
        json('POST', { password, ...(code.trim() ? { code: code.trim() } : {}) }),
      );
      const work = waiting;
      setWaiting(null);
      await work?.();
    },
    [request, waiting],
  );
  return { run, confirm, asking: waiting !== null, cancel: () => setWaiting(null) };
}

/** Password, two-step verification and the sessions of the account. */
export function SecurityScreen() {
  const all = useTranslations();
  const t = useTranslations('auth');
  const s = useTranslations('auth.security');
  const m = useTranslations('mobile');
  const format = useFormatter();
  const { request } = useSession();
  const guard = useProtected();
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [reauth, setReauth] = useState({ password: '', code: '' });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    request<MfaStatus>('/api/v1/auth/mfa')
      .then((result) => active && setMfa(result))
      .catch((caught: unknown) => active && setError(caught));
    request<{ sessions: SessionItem[] }>('/api/v1/auth/sessions')
      .then((result) => active && setSessions(result.sessions))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request, version]);

  /** One change at a time; its error or its message is shown under the title. */
  async function act(work: () => Promise<void>, protect = false) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await (protect ? guard.run(work) : work());
      setVersion((v) => v + 1);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const problems = (caught: unknown): string | null => {
    if (!(caught instanceof ApiError)) return null;
    const detail = caught.details.find((d) => t.has(`passwordProblems.${d.code}`));
    return detail ? t(`passwordProblems.${detail.code}`) : null;
  };

  return (
    <Screen>
      <Back />
      <Title>{s('title')}</Title>
      {mfa?.requiredByRole && !mfa.enabled && <Notice tone="warning">{s('enrollBanner')}</Notice>}
      {error !== null && (
        <Notice tone="error">{problems(error) ?? errorMessage(error, all)}</Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}

      {guard.asking && (
        <Card>
          <Heading>{s('reauthTitle')}</Heading>
          <Body muted>{s('reauthIntro')}</Body>
          <Field
            label={t('fields.password')}
            value={reauth.password}
            onChangeText={(password) => setReauth((r) => ({ ...r, password }))}
            secureTextEntry
            autoCapitalize="none"
          />
          {mfa?.enabled && (
            <Field
              label={t('fields.code')}
              hint={t('hints.code')}
              value={reauth.code}
              onChangeText={(value) => setReauth((r) => ({ ...r, code: value }))}
              autoCapitalize="none"
            />
          )}
          <Button
            label={s('reauthSubmit')}
            pending={pending}
            disabled={!reauth.password}
            onPress={() =>
              void act(async () => {
                await guard.confirm(reauth.password, reauth.code);
                setReauth({ password: '', code: '' });
              })
            }
          />
          <Button label={s('cancel')} variant="link" onPress={guard.cancel} />
        </Card>
      )}

      <Card>
        <Heading>{s('mfaTitle')}</Heading>
        {mfa && (
          <Tag tone={mfa.enabled ? 'success' : 'plain'}>
            {mfa.enabled ? s('mfaOn') : s('mfaOff')}
          </Tag>
        )}
        <Body muted>{s('mfaExplain')}</Body>
        {mfa && !mfa.enabled && !setup && (
          <Button
            label={s('setupStart')}
            disabled={pending}
            onPress={() =>
              void act(async () => {
                setSetup(await request<TotpSetup>('/api/v1/auth/mfa/totp/setup', json('POST')));
              }, true)
            }
          />
        )}
        {setup && (
          <>
            <Body>{m('security.openApp')}</Body>
            <Button
              label={m('security.openAppButton')}
              variant="secondary"
              onPress={() => void Linking.openURL(setup.otpauthUri).catch(() => undefined)}
            />
            <Body>{s('setupManual')}</Body>
            <Text style={styles.secret} selectable>
              {groupSecret(setup.secret)}
            </Text>
            <Field
              label={t('fields.code')}
              hint={t('hints.totp')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button
              label={s('setupConfirm')}
              pending={pending}
              disabled={code.length < 6}
              onPress={() =>
                void act(async () => {
                  const result = await request<{ recoveryCodes?: string[] }>(
                    '/api/v1/auth/mfa/totp/confirm',
                    json('POST', { factorId: setup.factorId, code }),
                  );
                  setSetup(null);
                  setCode('');
                  if (result.recoveryCodes) setRecovery(result.recoveryCodes);
                })
              }
            />
          </>
        )}
        {recovery && (
          <>
            <Heading>{s('recoveryTitle')}</Heading>
            <Body muted>{s('recoveryIntro')}</Body>
            <Text style={styles.secret} selectable>
              {recovery.join('\n')}
            </Text>
            <Button
              label={copied ? s('copied') : s('copy')}
              variant="secondary"
              onPress={() =>
                void Clipboard.setStringAsync(recovery.join('\n')).then(() => setCopied(true))
              }
            />
            <Button
              label={s('recoverySaved')}
              onPress={() => {
                setRecovery(null);
                setCopied(false);
              }}
            />
          </>
        )}
        {mfa?.enabled && !recovery && (
          <>
            <Body muted>{s('recoveryRemaining', { count: mfa.recoveryCodesRemaining })}</Body>
            <Button
              label={s('regenerate')}
              variant="secondary"
              disabled={pending}
              onPress={() =>
                void act(async () => {
                  const result = await request<{ recoveryCodes: string[] }>(
                    '/api/v1/auth/mfa/recovery-codes',
                    json('POST'),
                  );
                  setRecovery(result.recoveryCodes);
                }, true)
              }
            />
            {mfa.canDisable && mfa.factorId ? (
              <Button
                label={s('disable')}
                variant="danger"
                disabled={pending}
                onPress={() =>
                  void act(async () => {
                    await request(
                      `/api/v1/auth/mfa/${encodeURIComponent(mfa.factorId ?? '')}`,
                      json('DELETE'),
                    );
                  }, true)
                }
              />
            ) : (
              mfa.requiredByRole && <Body muted>{s('disableRequiredByRole')}</Body>
            )}
          </>
        )}
      </Card>

      <Card>
        <Heading>{s('passwordTitle')}</Heading>
        <Field
          label={t('fields.currentPassword')}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          autoCapitalize="none"
        />
        <Field
          label={t('fields.newPassword')}
          hint={t('hints.newPassword')}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button
          label={s('passwordSubmit')}
          pending={pending}
          disabled={!current || !next}
          onPress={() =>
            void act(async () => {
              await request(
                '/api/v1/auth/password/change',
                json('POST', { currentPassword: current, newPassword: next }),
              );
              setCurrent('');
              setNext('');
              setMessage(s('passwordChanged'));
            })
          }
        />
      </Card>

      <Card>
        <Heading>{s('sessionsTitle')}</Heading>
        {!sessions && <Body muted>{m('loading')}</Body>}
        {sessions?.map((session) => (
          <View key={session.id} style={styles.session}>
            <Text style={styles.strong}>{session.device}</Text>
            {session.current && <Tag tone="success">{s('sessionCurrent')}</Tag>}
            <Text style={styles.meta}>
              {s('sessionDetails', {
                lastSeen: when(session.lastSeenAt),
                started: when(session.createdAt),
              })}
            </Text>
            {!session.current && (
              <Button
                label={`${s('revoke')}: ${session.device}`}
                variant="link"
                disabled={pending}
                onPress={() =>
                  void act(async () => {
                    await request(
                      `/api/v1/auth/sessions/${encodeURIComponent(session.id)}`,
                      json('DELETE'),
                    );
                  })
                }
              />
            )}
          </View>
        ))}
        {sessions && sessions.every((session) => session.current) ? (
          <Body muted>{s('noOtherSessions')}</Body>
        ) : (
          sessions && (
            <Button
              label={s('revokeOthers')}
              variant="secondary"
              disabled={pending}
              onPress={() =>
                void act(async () => {
                  const result = await request<{ revoked: number }>(
                    '/api/v1/auth/sessions',
                    json('DELETE'),
                  );
                  setMessage(s('revokedOthers', { count: result.revoked }));
                })
              }
            />
          )
        )}
      </Card>
      <Body muted>{m('signIn.passkeyNote')}</Body>
    </Screen>
  );
}

/** The accessibility statement, the same text as on the site. */
export function AccessibilityStatement() {
  const t = useTranslations('portal.accessibility');
  const list = (key: 'done' | 'gaps') => t.raw(key) as string[];
  return (
    <Screen>
      <Back />
      <Title>{t('title')}</Title>
      <Body muted>{t('updated')}</Body>
      <Notice>{t('demo')}</Notice>
      <Heading>{t('aimTitle')}</Heading>
      <Body>{t('aim')}</Body>
      <Heading>{t('doneTitle')}</Heading>
      {list('done').map((line) => (
        <Body key={line}>{`• ${line}`}</Body>
      ))}
      <Heading>{t('notDoneTitle')}</Heading>
      <Body>{t('notDone')}</Body>
      <Heading>{t('gapsTitle')}</Heading>
      {list('gaps').map((line) => (
        <Body key={line}>{`• ${line}`}</Body>
      ))}
      <Heading>{t('contactTitle')}</Heading>
      <Body>{t('contact')}</Body>
    </Screen>
  );
}

/** A message the association sent to its members, opened from its notice. */
export function BroadcastMessage({ id }: { id: string }) {
  const all = useTranslations();
  const t = useTranslations('notifications.message');
  const m = useTranslations('mobile');
  const locale = useLocale();
  const format = useFormatter();
  const { request } = useSession();
  const [message, setMessage] = useState<Schemas['BroadcastMessageDto'] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    request<Schemas['BroadcastMessageDto']>(
      `/api/v1/broadcasts/${encodeURIComponent(id)}?locale=${locale}`,
    )
      .then((result) => active && setMessage(result))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, id, locale]);

  return (
    <Screen>
      <Back />
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {!message && error === null && <Body muted>{m('loading')}</Body>}
      {message && (
        <>
          <Text style={styles.meta}>
            {all('organisations.owner.from', {
              name: message.organisation
                ? locale === 'he'
                  ? message.organisation.nameHe
                  : message.organisation.nameEn
                : all('common.app.name'),
            })}
          </Text>
          <Title>{message.title}</Title>
          <Text style={styles.meta}>
            {t('sentAt', {
              when: format.dateTime(new Date(message.sentAt), {
                dateStyle: 'long',
                timeStyle: 'short',
              }),
            })}
          </Text>
          {message.paragraphs.map((paragraph, index) => (
            <Body key={index}>{paragraph}</Body>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  group: { gap: 6 },
  photo: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.neutral[100] },
  fact: { gap: 2 },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
  secret: {
    fontFamily: 'monospace',
    fontSize: 17,
    lineHeight: 26,
    color: semantic.text,
    backgroundColor: colors.neutral[100],
    borderRadius: 8,
    padding: 12,
  },
  session: { gap: 4, borderBottomWidth: 1, borderBottomColor: semantic.border, paddingBottom: 10 },
});
