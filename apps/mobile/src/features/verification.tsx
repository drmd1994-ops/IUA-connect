import type { components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { fileName } from '@/chat/model';
import { errorMessage } from '@/errors';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { useLocalName } from './reference';

type Schemas = components['schemas'];
type Mine = Schemas['MyVerificationDto'];
type Request = Schemas['VerificationRequestDto'];
type Kind = Request['kind'];
type School = Schemas['MedicalSchoolListDto']['items'][number];
type Profile = Schemas['ProfileDto'];
type Picked = { uri: string; name: string; mimeType: string };

const KINDS: Kind[] = ['SPECIALIST', 'RESIDENT', 'PHYSICIAN', 'STUDENT'];

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** "Medical student" or "Resident" beside a name (M17); nothing for anyone else. */
export function PersonMark({ mark }: { mark: 'STUDENT' | 'RESIDENT' | null | undefined }) {
  const t = useTranslations('verification.marks');
  return mark ? <Tag>{t(mark)}</Tag> : null;
}

/**
 * The person's verification by the platform, in the app (M17 step 8): where they stand, their
 * latest request, and asking (or renewing, or answering a refusal). The server decides.
 */
export function VerificationScreen() {
  const all = useTranslations();
  const t = useTranslations('verification');
  const name = useLocalName();
  const format = useFormatter();
  const router = useRouter();
  const { request } = useSession();
  const [mine, setMine] = useState<Mine | null>(null);
  const [named, setNamed] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [kind, setKind] = useState<Kind | ''>('');
  const [licence, setLicence] = useState('');
  const [certificate, setCertificate] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [graduation, setGraduation] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      request<Mine>('/api/v1/me/verification'),
      request<Profile>('/api/v1/me/profile'),
      request<Schemas['MedicalSchoolListDto']>('/api/v1/medical-schools'),
    ])
      .then(([verification, profile, list]) => {
        if (!active) return;
        setMine(verification);
        setNamed(!!profile.firstName && !!profile.lastName);
        setSchools(list.items);
      })
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, version]);

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  const day = (value: string) =>
    format.dateTime(new Date(`${value.slice(0, 10)}T00:00:00Z`), {
      dateStyle: 'long',
      timeZone: 'UTC',
    });

  async function act(work: () => Promise<unknown>, done: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(done);
      setVersion((v) => v + 1);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function pick() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const mimeType = asset.mimeType ?? 'application/pdf';
    setPicked({ uri: asset.uri, mimeType, name: fileName(asset.uri, mimeType, asset.name) });
  }

  async function submit() {
    if (!kind) return;
    let documentFileId: string | undefined;
    if (kind === 'STUDENT' && picked) {
      const form = new FormData();
      // The phone's own way of naming a file on disk for an upload.
      form.append('file', {
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType,
      } as unknown as Blob);
      const file = await request<{ id: string }>('/api/v1/me/verification/document', {
        method: 'POST',
        body: form,
      });
      documentFileId = file.id;
    }
    await request(
      '/api/v1/me/verification',
      post({
        kind,
        ...(kind === 'STUDENT'
          ? {
              ...(schoolId ? { schoolId } : {}),
              ...(graduation.trim() ? { expectedGraduation: graduation.trim() } : {}),
              ...(documentFileId ? { documentFileId } : {}),
            }
          : { licence: licence.trim(), ...(kind === 'SPECIALIST' ? { certificate } : {}) }),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  const latest: Request | null = mine?.latest ?? null;
  const verified = mine?.status === 'VERIFIED';
  return (
    <Screen>
      <Back />
      <Title>{t('page.title')}</Title>
      <Body muted>{t('page.intro')}</Body>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {!mine && error === null && <Body muted>{t('page.loading')}</Body>}
      {mine && (
        <Card>
          <Text style={styles.strong}>
            {verified && mine.verifiedAs
              ? t('page.statuses.VERIFIED', { as: t(`kinds.${mine.verifiedAs}`) })
              : t(`page.statuses.${mine.status}`)}
          </Text>
          {verified && mine.verifiedUntil ? (
            <Body muted>{t('page.until', { date: date(mine.verifiedUntil) })}</Body>
          ) : null}
          {mine.byOrganisation ? <Body muted>{t('page.byOrganisation')}</Body> : null}
          {verified && mine.canAsk ? <Notice tone="warning">{t('page.renewNow')}</Notice> : null}
          {!verified ? <Body muted>{t('page.whatOpens')}</Body> : null}
        </Card>
      )}

      {latest && (
        <Card>
          <Heading>{t('page.latestTitle')}</Heading>
          <Text style={styles.strong}>
            {t(`kinds.${latest.kind}`)} · {t(`page.states.${latest.state}`)}
          </Text>
          <Text style={styles.meta}>{t('page.sentOn', { date: date(latest.createdAt) })}</Text>
          {latest.school ? (
            <Body>
              {name(latest.school)}
              {latest.expectedGraduation ? ` · ${day(latest.expectedGraduation)}` : ''}
            </Body>
          ) : null}
          {latest.documentHeld ? <Body muted>{t('page.documentHeld')}</Body> : null}
          {latest.decisions.map((decision) => (
            <Body key={decision.at}>
              {t('page.decisionLine', {
                decision: t(`page.decisions.${decision.decision}`),
                date: date(decision.at),
              })}
              {decision.reason ? `\n${t('page.reason', { reason: decision.reason })}` : ''}
            </Body>
          ))}
          {latest.state === 'PENDING' && (
            <Button
              label={t('page.withdraw')}
              variant="secondary"
              disabled={pending}
              onPress={() =>
                void act(
                  () => request('/api/v1/me/verification/withdraw', { method: 'POST' }),
                  t('page.states.WITHDRAWN'),
                )
              }
            />
          )}
        </Card>
      )}

      {mine?.canAsk && (
        <Card>
          <Heading>
            {verified || mine.status === 'EXPIRED'
              ? t('form.renewTitle')
              : mine.status === 'REFUSED'
                ? t('form.answerTitle')
                : t('form.title')}
          </Heading>
          {!named ? (
            <>
              <Notice tone="warning">{t('page.profileFirst')}</Notice>
              <Button label={t('page.goToProfile')} onPress={() => router.push('/profile')} />
            </>
          ) : (
            <>
              <Text style={styles.label}>{t('form.kind')}</Text>
              <Choices
                label={t('form.kind')}
                value={kind}
                onChange={setKind}
                options={KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
              />
              {kind !== '' && kind !== 'STUDENT' && (
                <Field
                  label={t('form.licence')}
                  hint={t('form.licenceHint')}
                  value={licence}
                  onChangeText={setLicence}
                  keyboardType="number-pad"
                  autoComplete="off"
                />
              )}
              {kind === 'SPECIALIST' && (
                <Field
                  label={t('form.certificate')}
                  value={certificate}
                  onChangeText={setCertificate}
                  keyboardType="number-pad"
                  autoComplete="off"
                />
              )}
              {kind === 'STUDENT' && (
                <>
                  <Text style={styles.label}>{t('form.school')}</Text>
                  <Choices
                    label={t('form.school')}
                    value={schoolId}
                    onChange={setSchoolId}
                    options={schools.map((school) => ({ value: school.id, label: name(school) }))}
                  />
                  <Field
                    label={t('form.graduation')}
                    hint={`${t('form.graduationHint')} (YYYY-MM-DD)`}
                    value={graduation}
                    onChangeText={setGraduation}
                    autoComplete="off"
                    placeholder="2029-06-30"
                  />
                  <Text style={styles.label}>{t('form.document')}</Text>
                  <Body muted>{t('form.documentHint')}</Body>
                  {picked ? <Body>{t('form.uploaded', { name: picked.name })}</Body> : null}
                  <Button
                    label={t('form.document')}
                    variant="secondary"
                    onPress={() => void pick()}
                  />
                </>
              )}
              <Field
                label={t('form.note')}
                hint={mine.status === 'REFUSED' ? t('form.answerHint') : undefined}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={1000}
              />
              <Button
                label={t('form.submit')}
                pending={pending}
                disabled={!kind}
                onPress={() => void act(submit, t('form.submitted'))}
              />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: semantic.text },
  meta: { fontSize: 14, lineHeight: 20, color: semantic.textMuted },
  strong: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: semantic.text },
});
