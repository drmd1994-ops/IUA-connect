import { useTranslations } from 'use-intl';
import { errorReason } from '@/errors';
import { Body, Button, Notice, Screen, Title } from './kit';

/** What a screen that broke while drawing shows in its place: what broke, and a way back. */
export function Crashed({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const t = useTranslations();
  const reason = errorReason(error);
  return (
    <Screen>
      <Title>{t('mobile.crashed.title')}</Title>
      <Body>{t('mobile.crashed.text')}</Body>
      {reason && <Notice tone="error">{t('errors.reason', { reason })}</Notice>}
      <Button label={t('mobile.crashed.retry')} onPress={() => void retry()} />
    </Screen>
  );
}
