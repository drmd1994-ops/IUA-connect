import { fetch as streamingFetch } from 'expo/fetch';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { API_URL } from '@/config';
import { useSession } from '@/session/session-provider';
import { Body, Button, Card, Heading, Notice } from '@/ui/kit';

/** The server sends a small "still here" event at least this often. */
const LISTEN_MS = 30_000;

type Result = { ok: boolean; detail: string } | null;

/**
 * A check for the first test on a real phone (plan §1 and §8, checkpoint 3): whether a
 * long-running answer that arrives piece by piece, which chat's live updates are, can be read
 * on this phone. It opens the same stream the chat pages use and waits for its first piece.
 */
export function ConnectionCheck() {
  const t = useTranslations('mobile.check');
  const { session } = useSession();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LISTEN_MS);
    try {
      const response = await streamingFetch(`${API_URL}/api/v1/chat/stream`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.accessToken() ?? ''}`,
        },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        setResult({ ok: false, detail: `status ${response.status}` });
        return;
      }
      const opened = Date.now() - started;
      const reader = response.body.getReader();
      const { value, done } = await reader.read();
      const bytes = value?.length ?? 0;
      await reader.cancel().catch(() => undefined);
      setResult({
        ok: !done && bytes > 0,
        detail: `opened ${opened} ms, first piece ${Date.now() - started} ms, ${bytes} bytes`,
      });
    } catch (error) {
      setResult({
        ok: false,
        detail: `${Date.now() - started} ms, ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      clearTimeout(timeout);
      setRunning(false);
    }
  }

  return (
    <Card>
      <Heading>{t('title')}</Heading>
      <Body muted>{t('intro')}</Body>
      <Button
        label={running ? t('running') : t('start')}
        variant="secondary"
        pending={running}
        onPress={() => void run()}
      />
      {result && (
        <>
          <Notice tone={result.ok ? 'success' : 'warning'}>
            {result.ok ? t('ok') : t('failed')}
          </Notice>
          <Body muted>{t('detail', { detail: result.detail })}</Body>
        </>
      )}
    </Card>
  );
}
