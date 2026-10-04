import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, finalize, interval, map, merge, takeUntil, timer } from 'rxjs';
import { RealtimeBus } from '../../infra/realtime/realtime-bus';

/**
 * What the browser is told while a chat page is open (M11 plan §6). An event names ids only;
 * the browser then asks for what it may see through the ordinary routes, so nothing here can
 * show a person text that isn't theirs.
 */
export type ChatEvent =
  | {
      type: 'message.new' | 'message.edited' | 'message.deleted';
      conversationId: string;
      messageId: string;
      seq: number;
    }
  /** Someone's read or delivered marker moved, or their own settings of the conversation. */
  | { type: 'markers'; conversationId: string; userId: string }
  | { type: 'typing'; conversationId: string; userId: string }
  /** Something about the reader's own chat changed (a suspension): ask again. */
  | { type: 'refresh' }
  /** Sent regularly, so both ends notice a dead connection. */
  | { type: 'ping' };

const TOPIC = 'chat';
export const MAX_STREAMS_PER_PERSON = 3;
const HEARTBEAT_MS = 25_000;
/**
 * A stream ends after this long and the browser opens a new one with a fresh sign-in token, so
 * a session that was ended elsewhere stops receiving within minutes.
 */
const MAX_STREAM_MS = 10 * 60 * 1000;

/**
 * The open streams of this API process, by person. Events are published through the realtime
 * bus, so a message written through one process reaches a browser connected to another.
 */
@Injectable()
export class ChatStream implements OnModuleDestroy {
  private readonly logger = new Logger(ChatStream.name);
  private readonly streams = new Map<string, Subject<ChatEvent>[]>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly bus: RealtimeBus) {}

  /** Tells these people. A failure is logged and never undoes what caused the event. */
  async publish(to: readonly string[], event: ChatEvent): Promise<void> {
    const recipients = [...new Set(to)];
    if (recipients.length === 0) return;
    try {
      await this.bus.publish(TOPIC, { to: recipients, event });
    } catch (error) {
      this.logger.warn({ err: error, type: event.type }, 'Chat event could not be published');
    }
  }

  /** A person's stream of events. At most three at once: a fourth closes the oldest. */
  open(userId: string): Observable<ChatEvent> {
    this.unsubscribe ??= this.bus.subscribe(TOPIC, (payload) => this.deliver(payload));
    const subject = new Subject<ChatEvent>();
    const mine = this.streams.get(userId) ?? [];
    mine.push(subject);
    this.streams.set(userId, mine);
    while (mine.length > MAX_STREAMS_PER_PERSON) mine.shift()!.complete();

    return merge(subject, interval(HEARTBEAT_MS).pipe(map((): ChatEvent => ({ type: 'ping' }))))
      .pipe(takeUntil(merge(timer(MAX_STREAM_MS), endOf(subject))))
      .pipe(finalize(() => this.close(userId, subject)));
  }

  /** How many streams a person has open in this process. */
  count(userId: string): number {
    return this.streams.get(userId)?.length ?? 0;
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    for (const subjects of this.streams.values()) {
      for (const subject of [...subjects]) subject.complete();
    }
    this.streams.clear();
  }

  private deliver(payload: unknown): void {
    const { to, event } = (payload ?? {}) as { to?: unknown; event?: ChatEvent };
    if (!Array.isArray(to) || !event) return;
    for (const userId of to) {
      if (typeof userId !== 'string') continue;
      for (const subject of this.streams.get(userId) ?? []) subject.next(event);
    }
  }

  private close(userId: string, subject: Subject<ChatEvent>): void {
    subject.complete();
    const rest = (this.streams.get(userId) ?? []).filter((other) => other !== subject);
    if (rest.length > 0) this.streams.set(userId, rest);
    else this.streams.delete(userId);
  }
}

/** Emits once when the subject completes (the heartbeat alone would keep the stream open). */
function endOf(subject: Subject<ChatEvent>): Observable<void> {
  return new Observable<void>((subscriber) =>
    subject.subscribe({
      complete: () => {
        subscriber.next();
        subscriber.complete();
      },
    }),
  );
}
