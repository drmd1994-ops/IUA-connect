import { useTranslations } from 'use-intl';
import { API_URL } from '@/config';
import { Home } from '@/features/home';
import { LanguageChoice } from '@/features/language-choice';
import { SignIn } from '@/features/sign-in';
import { useSession } from '@/session/session-provider';
import { Body, Button, Notice, Screen, Title } from '@/ui/kit';

/** The first screen: sign-in for a visitor, the home screen for a signed-in person. */
export default function Index() {
  const t = useTranslations('mobile');
  const { session, status } = useSession();

  if (status === 'signedIn') return <Home />;
  if (status === 'signedOut') return <SignIn />;
  if (status === 'unreachable') {
    return (
      <Screen>
        <Title>{t('unreachable.title')}</Title>
        <Notice tone="warning">{t('unreachable.text', { address: API_URL })}</Notice>
        <Button label={t('unreachable.retry')} onPress={() => void session.restore()} />
        <Button
          label={t('account.signOut')}
          variant="secondary"
          onPress={() => void session.signOut()}
        />
        <LanguageChoice />
      </Screen>
    );
  }
  return (
    <Screen>
      <Body muted>{t('loading')}</Body>
    </Screen>
  );
}
