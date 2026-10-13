import { ApiError, type components } from '@medconnect/api-client';
import { semantic } from '@medconnect/ui-tokens';
import { useRouter } from 'expo-router';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { errorMessage } from '@/errors';
import { useLocale } from '@/i18n/i18n-provider';
import { useSession } from '@/session/session-provider';
import { Back, Body, Button, Card, Field, Heading, Notice, Screen, Title } from '@/ui/kit';
import { Choices, Tag } from '@/ui/parts';
import { useHospitals, useLocalName } from './reference';

type Schemas = components['schemas'];
type Application = Schemas['ApplicationListDto']['items'][number];
type MembershipType = Schemas['MembershipTypeListDto']['items'][number];
type Department = Schemas['DepartmentListDto']['items'][number];

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

interface Guest {
  /** Nobody is signed in, and the open pages are being read. */
  guest: boolean;
  /** Back to the sign-in screen. */
  toSignIn: () => void;
}
const GuestContext = createContext<Guest>({ guest: false, toSignIn: () => undefined });

export function GuestProvider({
  toSignIn,
  children,
}: {
  toSignIn: () => void;
  children: ReactNode;
}) {
  return (
    <GuestContext.Provider value={{ guest: true, toSignIn }}>{children}</GuestContext.Provider>
  );
}

export function useGuest(): Guest {
  return useContext(GuestContext);
}

/** What a visitor sees on Home: what is open to everyone, and the way to sign in. */
export function GuestHome() {
  const t = useTranslations();
  const router = useRouter();
  const { toSignIn } = useGuest();
  return (
    <Screen>
      <Title>{t('mobile.home.title')}</Title>
      <Body>{t('mobile.guest.intro')}</Body>
      <Button label={t('mobile.signIn.submit')} onPress={toSignIn} />
      <Card>
        <Heading>{t('mobile.home.more')}</Heading>
        <Button
          label={t('education.nav')}
          variant="secondary"
          onPress={() => router.push('/education')}
        />
        <Button
          label={t('education.list.examLink')}
          variant="secondary"
          onPress={() => router.push('/exam')}
        />
        <Button
          label={t('content.guidelines.title')}
          variant="secondary"
          onPress={() => router.push('/guidelines')}
        />
        <Button
          label={t('search.page.title')}
          variant="secondary"
          onPress={() => router.push('/search')}
        />
        <Button
          label={t('portal.accessibility.title')}
          variant="link"
          onPress={() => router.push('/accessibility')}
        />
      </Card>
    </Screen>
  );
}

/** The words for a password the server refused, or the plain error. */
function usePasswordError() {
  const all = useTranslations();
  const t = useTranslations('auth.passwordProblems');
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const detail = error.details.find((d) => t.has(d.code));
      if (detail) return t(detail.code);
    }
    return errorMessage(error, all);
  };
}

/** Asking for a link to choose a new password. The answer never says whether the address exists. */
export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const all = useTranslations();
  const t = useTranslations('auth');
  const { request } = useSession();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await request('/api/v1/auth/password/forgot', post({ email: email.trim() }));
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Button label={t('forgot.backToSignIn')} variant="link" onPress={onBack} />
      <Title>{t('forgot.title')}</Title>
      {done ? (
        <>
          <Notice tone="success">{t('forgot.doneBody')}</Notice>
          <Body muted>{all('mobile.guest.linkOpensSite')}</Body>
        </>
      ) : (
        <>
          <Body muted>{t('forgot.intro')}</Body>
          <Field
            label={t('fields.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
          <Button
            label={t('forgot.submit')}
            pending={pending}
            disabled={!email.trim()}
            onPress={() => void submit()}
          />
        </>
      )}
    </Screen>
  );
}

/** Opening an account. The address is verified through a link sent by email. */
export function Register({ onBack }: { onBack: () => void }) {
  const all = useTranslations();
  const t = useTranslations('auth');
  const locale = useLocale();
  const passwordError = usePasswordError();
  const { request } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await request('/api/v1/auth/register', post({ email: email.trim(), password, locale }));
      setDone(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <Button label={t('register.signInLink')} variant="link" onPress={onBack} />
      <Title>{done ? t('register.doneTitle') : t('register.title')}</Title>
      {done ? (
        <>
          <Notice tone="success">{t('register.doneBody')}</Notice>
          <Body muted>{all('mobile.guest.linkOpensSite')}</Body>
          <Body>{all('mobile.guest.afterVerify')}</Body>
        </>
      ) : (
        <>
          <Body muted>{t('register.intro')}</Body>
          <Field
            label={t('fields.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label={t('fields.newPassword')}
            hint={t('hints.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          {error !== null && <Notice tone="error">{passwordError(error)}</Notice>}
          <Button
            label={t('register.submit')}
            pending={pending}
            disabled={!email.trim() || !password}
            onPress={() => void submit()}
          />
        </>
      )}
    </Screen>
  );
}

/** Applying for membership, and the applications already made. */
export function Applications() {
  const all = useTranslations();
  const t = useTranslations('membership');
  const m = useTranslations('mobile');
  const name = useLocalName();
  const format = useFormatter();
  const router = useRouter();
  const hospitals = useHospitals();
  const { request } = useSession();
  const [items, setItems] = useState<Application[] | null>(null);
  const [types, setTypes] = useState<MembershipType[]>([]);
  const [named, setNamed] = useState(true);
  const [typeId, setTypeId] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    request<{ items: Application[] }>('/api/v1/verification-requests/mine')
      .then((result) => active && setItems(result.items))
      .catch((caught: unknown) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [request, version]);

  useEffect(() => {
    let active = true;
    request<{ items: MembershipType[] }>('/api/v1/membership-types')
      .then((result) => active && setTypes(result.items.filter((type) => type.selfApply)))
      .catch(() => undefined);
    request<{ firstName: string | null; lastName: string | null }>('/api/v1/me/profile')
      .then((profile) => active && setNamed(Boolean(profile.firstName && profile.lastName)))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

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

  async function act(work: () => Promise<unknown>, done: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(done);
      setVersion((v) => v + 1);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'long' });
  const type = types.find((candidate) => candidate.id === typeId);
  const needsNumber = type !== undefined && type.identifier !== 'NONE';
  const open = items?.some((item) => item.state.startsWith('PENDING')) ?? false;
  return (
    <Screen>
      <Back />
      <Title>{t('application.title')}</Title>
      {error !== null && <Notice tone="error">{errorMessage(error, all)}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {!items && error === null && <Body muted>{m('loading')}</Body>}
      {items?.map((item) => (
        <Card key={item.id}>
          <Text style={styles.strong}>{name(item.type)}</Text>
          <Tag tone={item.state === 'APPROVED' ? 'success' : 'plain'}>
            {t(`application.states.${item.state}`)}
          </Tag>
          <Text style={styles.meta}>
            {t('application.submittedOn', { date: date(item.createdAt) })}
          </Text>
          {item.hospital && (
            <Text style={styles.meta}>
              {[name(item.hospital), item.department ? name(item.department) : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          {item.identifierProvided && (
            <Text style={styles.meta}>{t('application.numberProvided')}</Text>
          )}
          {item.decisions.map((decision, index) => (
            <View key={index}>
              <Body>
                {t('application.decisionLine', {
                  stage: t(`application.stages.${decision.stage}`),
                  decision: t(`application.decisions.${decision.decision}`),
                  date: date(decision.at),
                })}
              </Body>
              {decision.reason ? (
                <Body muted>{t('application.reason', { reason: decision.reason })}</Body>
              ) : null}
            </View>
          ))}
          {item.state.startsWith('PENDING') && (
            <Button
              label={t('application.withdraw')}
              variant="secondary"
              disabled={pending}
              onPress={() =>
                void act(
                  () =>
                    request(
                      `/api/v1/verification-requests/${encodeURIComponent(item.id)}/withdraw`,
                      { method: 'POST' },
                    ),
                  t('application.withdrawn'),
                )
              }
            />
          )}
        </Card>
      ))}

      {items && !open && (
        <Card>
          <Heading>{t('apply.title')}</Heading>
          <Body muted>{t('apply.intro')}</Body>
          {!named ? (
            <>
              <Notice tone="warning">{t('apply.profileFirst')}</Notice>
              <Button label={t('apply.goToProfile')} onPress={() => router.push('/profile')} />
            </>
          ) : (
            <>
              <Text style={styles.label}>{t('apply.type')}</Text>
              <Choices
                label={t('apply.type')}
                value={typeId}
                onChange={setTypeId}
                options={types.map((option) => ({ value: option.id, label: name(option) }))}
              />
              <Text style={styles.label}>{t('apply.hospital')}</Text>
              <Choices
                label={t('apply.hospital')}
                value={hospitalId}
                onChange={(value) => {
                  setHospitalId(value);
                  setDepartmentId('');
                }}
                options={[
                  { value: '', label: t('profile.noHospital') },
                  ...hospitals.map((h) => ({ value: h.id, label: name(h) })),
                ]}
              />
              {hospitalId !== '' && departments.length > 0 && (
                <>
                  <Text style={styles.label}>{t('apply.department')}</Text>
                  <Choices
                    label={t('apply.department')}
                    value={departmentId}
                    onChange={setDepartmentId}
                    options={[
                      { value: '', label: t('profile.noHospital') },
                      ...departments.map((d) => ({ value: d.id, label: name(d) })),
                    ]}
                  />
                </>
              )}
              {needsNumber && (
                <Field
                  label={t(`apply.identifiers.${type.identifier}`)}
                  hint={t('apply.identifierHint')}
                  value={identifier}
                  onChangeText={setIdentifier}
                  keyboardType="number-pad"
                />
              )}
              <Button
                label={t('apply.submit')}
                pending={pending}
                disabled={!typeId || (needsNumber && !identifier.trim())}
                onPress={() =>
                  void act(
                    () =>
                      request(
                        '/api/v1/verification-requests',
                        post({
                          typeId,
                          ...(hospitalId ? { hospitalId } : {}),
                          ...(departmentId ? { departmentId } : {}),
                          ...(needsNumber ? { identifier: identifier.trim() } : {}),
                        }),
                      ),
                    t('apply.submitted'),
                  )
                }
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
