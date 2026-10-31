import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, finalize, interval, map, merge, takeUntil, timer } from 'rxjs';
import { AppException } from '../../common/errors/app.exception';
import { RealtimeBus } from '../../infra/realtime/realtime-bus';

/**
 * What a phone in the hall is told about an event (M32 plan §4). As in chat, an event names ids
 * only, and the reader then asks through the ordinary routes, so nothing here can show anyone
 * what isn't theirs.
 */
export type ConferenceEvent =
  | { type: 'polls' | 'questions'; sessionId: string }
  /** The event's sessions moved: the demonstration was started again. */
  | { type: 'schedule' }
  | { type: 'ping' };

const TOPIC = 'conference';
const MAX_STREAMS_PER_PERSON = 3;
const HEARTBEAT_MS = 25_000;
const MAX_STREAM_MS = 10 * 60 * 1000;
/**
 * A whole hall votes within seconds. However many changes come in, each session tells its
 * readers at most once in this long, and the readers then wait a random moment before asking.
 */
export const GATHER_MS = 2000;

interface BusMessage {
  eventId: string;
  event: ConferenceEvent;
}

@Injectable()
export class ConferenceStream implements OnModuleDestroy {
  private readonly logger = new Logger(ConferenceStream.name);
  private readonly streams = new Map<string, Set<Subject<ConferenceEvent>>>();
  private readonly perPerson = new Map<string, number>();
  private readonly gathering = new Map<string, NodeJS.Timeout>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly bus: RealtimeBus) {}

  /**
   * Says that something of a session changed, gathered: the first change starts the wait, and
   * those that arrive during it go with it.
   */
  changed(eventId: string, sessionId: string, type: 'polls' | 'questions'): void {
    const key = `${eventId}:${sessionId}:${type}`;
    if (this.gathering.has(key)) return;
    const timeout = setTimeout(() => {
      this.gathering.delete(key);
      this.publish({ eventId, event: { type, sessionId } });
    }, GATHER_MS);
    timeout.unref?.();
    this.gathering.set(key, timeout);
  }

  scheduleChanged(eventId: string): void {
    this.publish({ eventId, event: { type: 'schedule' } });
  }

  open(eventId: string, userId: string): Observable<ConferenceEvent> {
    const count = this.perPerson.get(userId) ?? 0;
    if (count >= MAX_STREAMS_PER_PERSON) throw new AppException('RATE_LIMITED');
    this.perPerson.set(userId, count + 1);
    this.listen();
    const subject = new Subject<ConferenceEvent>();
    const set = this.streams.get(eventId) ?? new Set();
    set.add(subject);
    this.streams.set(eventId, set);
    return merge(
      subject,
      interval(HEARTBEAT_MS).pipe(map((): ConferenceEvent => ({ type: 'ping' }))),
    ).pipe(
      takeUntil(timer(MAX_STREAM_MS)),
      finalize(() => {
        set.delete(subject);
        if (set.size === 0) this.streams.delete(eventId);
        const left = (this.perPerson.get(userId) ?? 1) - 1;
        if (left > 0) this.perPerson.set(userId, left);
        else this.perPerson.delete(userId);
      }),
    );
  }

  /** How many streams this process holds, for the load test's report. */
  get size(): number {
    let total = 0;
    for (const set of this.streams.values()) total += set.size;
    return total;
  }

  onModuleDestroy(): void {
    for (const timeout of this.gathering.values()) clearTimeout(timeout);
    this.gathering.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private listen(): void {
    this.unsubscribe ??= this.bus.subscribe(TOPIC, (payload) => {
      const message = payload as BusMessage;
      for (const subject of this.streams.get(message.eventId) ?? []) subject.next(message.event);
    });
  }

  /** A failure is logged and never undoes what caused the event: a hint costs a delay only. */
  private publish(message: BusMessage): void {
    this.bus.publish(TOPIC, message).catch((error: unknown) => {
      this.logger.warn({ err: error }, 'Conference event not published');
    });
  }
}
