'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { tokenStore } from '@/features/auth/token-store';
import { type ChatEvent, parseEvent } from './chat-model';

export type { ChatEvent };

/** Sent on the window when unread counts may have changed, so the Chat link follows at once. */
export const CHAT_CHANGED = 'iua:chat-changed';

const STREAM_PATH = '/api/v1/chat/stream';
/** Without the stream, the page asks again this often. */
const FALLBACK_MS = 10_000;
const MAX_RETRY_MS = 15_000;

/**
 * Listens to the reader's live events while the component is shown. The stream is read with
 * fetch, so the sign-in token travels in a header like every other request. When it drops, the
 * hook reconnects; while it can't connect, it asks the page to refresh every ten seconds.
 */
export function useChatEvents(onEvent: (event: ChatEvent) => void): void {
  const { api, call, status } = useAuth();
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const controller = new AbortController();
    let stopped = false;
    let fallback: number | undefined;
    const emit = (event: ChatEvent) => handler.current(event);
    const startFallback = () => {
      fallback ??= window.setInterval(() => emit({ type: 'refresh' }), FALLBACK_MS);
    };
    const stopFallback = () => {
      window.clearInterval(fallback);
      fallback = undefined;
    };
    const open = () =>
      fetch(STREAM_PATH, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${tokenStore.get() ?? ''}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

    async function run() {
      let failures = 0;
      let connectedBefore = false;
      while (!stopped) {
        try {
          let response = await open();
          if (response.status === 401) {
            // The token ran out: an ordinary request renews the session, then try once more.
            await call(() => api.GET('/api/v1/chat/unread-count'));
            response = await open();
          }
          if (!response.ok || !response.body) throw new Error('stream unavailable');
          stopFallback();
          failures = 0;
          if (connectedBefore) emit({ type: 'refresh' });
          connectedBefore = true;
          await read(response.body, emit);
        } catch {
          if (stopped) return;
          failures += 1;
          startFallback();
        }
        if (stopped) return;
        // A stream that ended by itself (the server closes it every ten minutes) reopens at once.
        await wait(failures === 0 ? 250 : Math.min(1000 * 2 ** failures, MAX_RETRY_MS));
      }
    }
    void run();

    return () => {
      stopped = true;
      stopFallback();
      controller.abort();
    };
  }, [api, call, status]);
}

/** Reads a text/event-stream body and hands each event's JSON to `emit`. */
async function read(body: ReadableStream<Uint8Array>, emit: (event: ChatEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = parseEvent(block);
      if (event && event.type !== 'ping') emit(event);
      end = buffer.indexOf('\n\n');
    }
  }
}
