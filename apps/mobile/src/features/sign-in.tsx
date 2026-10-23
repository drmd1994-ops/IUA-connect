import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { askForPasskey, passkeysSupported } from '@/session/passkey';
import { type CodeNeeded } from '@/session/session-core';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Field, Notice, Screen, Title } from '@/ui/kit';
import { LanguageChoice } from './language-choice';
import { passkeyMessage } from './passkeys';

/**
 * Signing in: a passkey on this phone, or email and password, then the authenticator code or a
 * passkey when the account has one. The same accounts as the site.
 */
export function SignIn({
  onForgot,
  onRegister,
  onGuest,
}: {
  onForgot: () => void;
  onRegister: () => void;
  /** Reading what is open to everyone, without an account. */
  onGuest: () => void;
}) {
  const all = useTranslations();
  const t = useTranslations('mobile.signIn');
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [second, setSecond] = useState<CodeNeeded | null>(null);
  const mfaToken = second?.mfaToken ?? null;
  const withPasskey = passkeysSupported();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(step: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await step();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const submit = () =>
    run(async () => {
      const next = await session.signIn(email.trim(), password);
      setPassword('');
      if (next) setSecond(next);
    });
  const passkey = () => run(() => session.signInWithPasskey(askForPasskey));
  const verify = () =>
    run(async () => {
      if (mfaToken) await session.verifyCode(mfaToken, code.trim());
    });

  if (mfaToken) {
    return (
      <Screen>
        <Title>{t('codeTitle')}</Title>
        <Body muted>{t('codeIntro')}</Body>
        <Card>
          <Field
            label={t('code')}
            value={code}
            onChangeText={setCode}
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            maxLength={32}
            returnKeyType="go"
            onSubmitEditing={() => void verify()}
          />
          {error !== null && <Notice tone="error">{passkeyMessage(error, all)}</Notice>}
          <Button
            label={t('verify')}
            pending={pending}
            disabled={code.trim().length < 6}
            onPress={() => void verify()}
          />
          {withPasskey && second?.methods.includes('passkey') && (
            <Button
              label={t('usePasskey')}
              variant="secondary"
              disabled={pending}
              onPress={() => void passkey()}
            />
          )}
          <Button
            label={t('back')}
            variant="link"
            onPress={() => {
              setSecond(null);
              setCode('');
              setError(null);
            }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('title')}</Title>
      <Body muted>{t('intro')}</Body>
      <Card>
        <Field
          label={t('email')}
          value={email}
          onChangeText={setEmail}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          maxLength={254}
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry
          maxLength={128}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {error !== null && <Notice tone="error">{passkeyMessage(error, all)}</Notice>}
        <Button
          label={t('submit')}
          pending={pending}
          disabled={!email.trim() || !password}
          onPress={() => void submit()}
        />
      </Card>
      {withPasskey && (
        <Button
          label={t('passkey')}
          variant="secondary"
          disabled={pending}
          onPress={() => void passkey()}
        />
      )}
      <Button label={t('forgot')} variant="link" onPress={onForgot} />
      <Button label={t('join')} variant="link" onPress={onRegister} />
      <Button label={t('guest')} variant="secondary" onPress={onGuest} />
      <LanguageChoice />
    </Screen>
  );
}
