'use client';

import {
  type ConferenceEvent,
  LIVE_FALLBACK_MS,
  askAgainDelay,
  parseConferenceEvent,
} from '@medconnect/api-client/conference';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { tokenStore } from '@/features/auth/token-store';

const MAX_RETRY_MS = 15_000;

/**
 * Listens to an event's live changes while the component is shown, as chat does (M32 plan §4). A
 * hall hears a change at once, so each page acts on it at a random moment. Without the stream the
 * page asks again every 15 seconds, and `onLive` says that it isn't live.
 */
export function useConferenceEvents(
  slug: string,
  onEvent: (event: ConferenceEvent) => void,
  onLive?: (live: boolean) => void,
): void {
  const { api, call, status } = useAuth();
  const handler = useRef(onEvent);
  const liveHandler = useRef(onLive);
  useEffect(() => {
    handler.current = onEvent;
    liveHandler.current = onLive;
  }, [onEvent, onLive]);

  useEffect(() => {
    if (status !== 'signedIn') return;
    const controller = new AbortController();
    let stopped = false;
    let fallback: number | undefined;
    const emit = (event: ConferenceEvent) => {
      window.setTimeout(() => {
        if (!stopped) handler.current(event);
      }, askAgainDelay());
    };
    const startFallback = () => {
      liveHandler.current?.(false);
      fallback ??= window.setInterval(() => handler.current({ type: 'refresh' }), LIVE_FALLBACK_MS);
    };
    const stopFallback = () => {
      liveHandler.current?.(true);
      window.clearInterval(fallback);
      fallback = undefined;
    };
    const path = `/api/v1/events/${encodeURIComponent(slug)}/live/stream`;
    const open = () =>
      fetch(path, {
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
            await call(() => api.GET('/api/v1/me'));
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
        // A stream that ended by itself (the server closes it every ten minutes) reopens soon.
        await wait(failures === 0 ? 250 : Math.min(1000 * 2 ** failures, MAX_RETRY_MS));
      }
    }
    void run();

    return () => {
      stopped = true;
      window.clearInterval(fallback);
      controller.abort();
    };
  }, [api, call, slug, status]);
}

async function read(body: ReadableStream<Uint8Array>, emit: (event: ConferenceEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const event = parseConferenceEvent(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event && event.type !== 'ping') emit(event);
      end = buffer.indexOf('\n\n');
    }
  }
}
