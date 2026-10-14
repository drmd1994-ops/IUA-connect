import { type ChatEvent, parseEvent } from '@medconnect/api-client/chat';
import { fetch as streamingFetch } from 'expo/fetch';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { API_URL } from '@/config';
import { useSession } from '@/session/session-provider';
import { takeBlocks } from './model';

export type { ChatEvent };

type Handler = (event: ChatEvent) => void;
type Subscribe = (handler: Handler) => () => void;

/** Without the stream, the screens are asked to refresh this often. */
const FALLBACK_MS = 10_000;
const MAX_RETRY_MS = 15_000;

const EventsContext = createContext<Subscribe | null>(null);

/**
 * The reader's live chat events, one stream for the whole app while it is on the screen. The
 * stream is read with a fetch that hands over an answer piece by piece. When it drops, it is
 * opened again; while it can't be, the screens are told to refresh every ten seconds. When the
 * app goes to the background the stream is closed, and reopened when the app returns.
 */
export function ChatEventsProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [handlers] = useState(() => new Set<Handler>());

  useEffect(() => {
    let controller: AbortController | null = null;
    let stopped = true;
    let fallback: ReturnType<typeof setInterval> | undefined;
    const emit: Handler = (event) => handlers.forEach((handler) => handler(event));
    const startFallback = () => {
      fallback ??= setInterval(() => emit({ type: 'refresh' }), FALLBACK_MS);
    };
    const stopFallback = () => {
      clearInterval(fallback);
      fallback = undefined;
    };
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const open = (signal: AbortSignal) =>
      streamingFetch(`${API_URL}/api/v1/chat/stream`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${session.accessToken() ?? ''}`,
        },
        signal,
      });

    async function run(signal: AbortSignal) {
      let failures = 0;
      let connectedBefore = false;
      while (!signal.aborted) {
        try {
          let response = await open(signal);
          if (response.status === 401) {
            // The access token ran out: the session is renewed, then once more.
            if (!(await session.refresh())) throw new Error('no session');
            response = await open(signal);
          }
          if (!response.ok || !response.body) throw new Error('stream unavailable');
          stopFallback();
          failures = 0;
          if (connectedBefore) emit({ type: 'refresh' });
          connectedBefore = true;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const taken = takeBlocks(buffer + decoder.decode(value, { stream: true }));
            buffer = taken.rest;
            for (const block of taken.blocks) {
              const event = parseEvent(block);
              if (event && event.type !== 'ping') emit(event);
            }
          }
        } catch {
          if (signal.aborted) return;
          failures += 1;
          startFallback();
        }
        if (signal.aborted) return;
        // A stream that ended by itself (the server closes it every ten minutes) reopens at once.
        await wait(failures === 0 ? 250 : Math.min(1000 * 2 ** failures, MAX_RETRY_MS));
      }
    }

    const start = () => {
      if (!stopped) return;
      stopped = false;
      controller = new AbortController();
      void run(controller.signal);
    };
    const stop = () => {
      stopped = true;
      stopFallback();
      controller?.abort();
      controller = null;
    };

    start();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const wasStopped = stopped;
        start();
        // What arrived while the app was away is fetched now.
        if (wasStopped) emit({ type: 'refresh' });
      } else {
        stop();
      }
    });
    return () => {
      listener.remove();
      stop();
    };
  }, [session, handlers]);

  const subscribe = useCallback<Subscribe>(
    (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    [handlers],
  );
  return <EventsContext.Provider value={subscribe}>{children}</EventsContext.Provider>;
}

/** Calls `onEvent` for every live event while the component is shown. */
export function useChatEvents(onEvent: Handler): void {
  const subscribe = useContext(EventsContext);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  // A visitor has no stream: there is nothing to listen to.
  useEffect(() => subscribe?.((event) => handler.current(event)), [subscribe]);
}
