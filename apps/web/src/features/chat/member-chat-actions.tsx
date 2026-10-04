'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage, isApiError } from '@/lib/api-errors';
import { ConfirmDialog, useStartConversation } from './chat-dialogs';

/**
 * On a member's page in the directory: write to them, or block them. Not shown on the
 * reader's own page.
 */
export function MemberChatActions({ userId, name }: { userId: string; name: string }) {
  const all = useTranslations();
  const t = useTranslations('chat');
  const { me, api, call } = useAuth();
  const start = useStartConversation();
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!me || me.id === userId) return null;

  async function write() {
    setPending(true);
    setError(null);
    try {
      await start(userId);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" pending={pending} disabled={blocked} onClick={() => void write()}>
          {t('start.send')}
        </Button>
        {!blocked && (
          <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
            {t('details.block')}
          </Button>
        )}
      </div>
      {error !== null && (
        <Alert tone="error">
          {isApiError(error, 'NOT_FOUND') ? t('start.unavailable') : errorMessage(error, all)}
        </Alert>
      )}
      {asking && (
        <ConfirmDialog
          title={t('confirm.blockTitle', { name })}
          confirmLabel={t('confirm.block')}
          onClose={() => setAsking(false)}
          onConfirm={async () => {
            await call(() => api.POST('/api/v1/chat/blocks', { body: { userId } }));
            setBlocked(true);
          }}
        >
          {t('confirm.blockText')}
        </ConfirmDialog>
      )}
    </div>
  );
}
