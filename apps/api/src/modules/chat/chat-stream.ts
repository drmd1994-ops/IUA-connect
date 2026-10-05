import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, finalize, interval, map, merge, takeUntil, timer } from 'rxjs';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RealtimeBus } from '../../infra/realtime/realtime-bus';

/**
 * What the browser is told while a chat page is open (M11 plan §6). An event names ids only;
 * the browser then asks for what it may see through the ordinary routes, so nothing here can
 * show a person text that isn't theirs.
 */
export type ChatEvent =
  | {
      /** "edited" also covers a message whose reactions changed. */
      type: 'message.new' | 'message.edited' | 'message.deleted';
      conversationId: string;
      messageId: string;
      seq: number;
    }
  /** Someone's read or delivered marker moved, or their own settings of the conversation. */
  | { type: 'markers'; conversationId: string; userId: string }
  | { type: 'typing'; conversationId: string; userId: string }
  /** A room or a group itself changed: its details, lock, pins, moderators or members (M12). */
  | { type: 'room'; conversationId: string }
  /** The reader is no longer in this room or group: they left or were taken out (M12). */
  | { type: 'room.left'; conversationId: string }
  /** The reader's invitations changed: one arrived, was withdrawn or was answered (M13). */
  | { type: 'invitation' }
  /** Someone the reader talks with came or went (M13). Says who, never whether. */
  | { type: 'activity'; userId: string }
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
/** Each process says who has a page open with it this often… */
const ANNOUNCE_EVERY_MS = 30_000;
/** …and a person nobody announced for this long is no longer online. */
const ONLINE_FOR_MS = 75_000;

/**
 * What travels on the bus: an event for named people, an event for a room, who is in a room,
 * and who has a chat page open.
 */
type BusMessage =
  | { to: string[]; event: ChatEvent }
  | { room: string; event: ChatEvent; except?: string }
  | { membership: { userId: string; roomId: string; present: boolean } }
  | { online: string[] }
  | { offline: string };

/** Told when a person's first chat page opens in this process, and when their last one closes. */
export type PresenceListener = (userId: string, online: boolean) => void;

/**
 * The open streams of this API process, by person. Events are published through the realtime
 * bus, so a message written through one process reaches a browser connected to another.
 *
 * An event of a private conversation names the people it is for. An event of a room or a group
 * names it (M12 plan §6): each process knows which of them the people with open streams are in,
 * so a room of thousands costs one small notification, not a list of its members.
 *
 * Who is online (M13) is not stored anywhere: it is who has a stream open. Every process says
 * so on the bus now and then, so each knows about the others' people too.
 */
@Injectable()
export class ChatStream implements OnModuleDestroy {
  private readonly logger = new Logger(ChatStream.name);
  private readonly streams = new Map<string, Subject<ChatEvent>[]>();
  /** The rooms and groups of each person who has a stream open here. */
  private readonly rooms = new Map<string, Set<string>>();
  /** When each person was last said to have a page open, in any process. */
  private readonly seen = new Map<string, number>();
  private readonly presenceListeners: PresenceListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private announcer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bus: RealtimeBus,
    private readonly prisma: PrismaService,
  ) {}

  /** Tells these people. A failure is logged and never undoes what caused the event. */
  async publish(to: readonly string[], event: ChatEvent): Promise<void> {
    const recipients = [...new Set(to)];
    if (recipients.length === 0) return;
    await this.send({ to: recipients, event }, event.type);
  }

  /** Tells everyone in a room or group who has a chat page open, except (optionally) one person. */
  async publishRoom(roomId: string, event: ChatEvent, except?: string): Promise<void> {
    await this.send({ room: roomId, event, ...(except ? { except } : {}) }, event.type);
  }

  /**
   * A person entered or left a room or a group, or staff opened a room they are not a member
   * of. Every process updates what it knows, so its events start or stop reaching that
   * person's open pages at once.
   */
  async setPresence(userId: string, roomId: string, present: boolean): Promise<void> {
    await this.send({ membership: { userId, roomId, present } }, 'membership');
  }

  /** A person's stream of events. At most three at once: a fourth closes the oldest. */
  open(userId: string): Observable<ChatEvent> {
    this.listen();
    const subject = new Subject<ChatEvent>();
    const mine = this.streams.get(userId) ?? [];
    const first = mine.length === 0;
    mine.push(subject);
    this.streams.set(userId, mine);
    while (mine.length > MAX_STREAMS_PER_PERSON) mine.shift()!.complete();
    if (!this.rooms.has(userId)) void this.loadRooms(userId);
    if (first) {
      this.seen.set(userId, Date.now());
      void this.send({ online: [userId] }, 'online');
      for (const listener of this.presenceListeners) listener(userId, true);
    }

    return merge(subject, interval(HEARTBEAT_MS).pipe(map((): ChatEvent => ({ type: 'ping' }))))
      .pipe(takeUntil(merge(timer(MAX_STREAM_MS), endOf(subject))))
      .pipe(finalize(() => this.close(userId, subject)));
  }

  /** How many streams a person has open in this process. */
  count(userId: string): number {
    return this.streams.get(userId)?.length ?? 0;
  }

  /** Whether a person has a chat page open now, with this process or another. */
  isOnline(userId: string, now = Date.now()): boolean {
    if (this.streams.has(userId)) return true;
    const at = this.seen.get(userId);
    return at !== undefined && now - at < ONLINE_FOR_MS;
  }

  onPresence(listener: PresenceListener): void {
    this.presenceListeners.push(listener);
  }

  /** Resolves once this process knows the rooms of a person with an open stream (for tests). */
  async roomsKnown(userId: string): Promise<void> {
    for (let i = 0; i < 100 && this.streams.has(userId) && !this.rooms.has(userId); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.announcer) clearInterval(this.announcer);
    for (const subjects of this.streams.values()) {
      for (const subject of [...subjects]) subject.complete();
    }
    this.streams.clear();
    this.rooms.clear();
    this.seen.clear();
  }

  private listen(): void {
    this.unsubscribe ??= this.bus.subscribe(TOPIC, (payload) => this.deliver(payload));
    if (this.announcer) return;
    this.announcer = setInterval(() => {
      const mine = [...this.streams.keys()];
      // The payload of a notification is limited; a few hundred ids fit in one.
      for (let i = 0; i < mine.length; i += 150) {
        void this.send({ online: mine.slice(i, i + 150) }, 'online');
      }
      const now = Date.now();
      for (const [userId, at] of this.seen) {
        if (now - at >= ONLINE_FOR_MS && !this.streams.has(userId)) this.seen.delete(userId);
      }
    }, ANNOUNCE_EVERY_MS);
    this.announcer.unref();
  }

  private async send(message: BusMessage, what: string): Promise<void> {
    try {
      await this.bus.publish(TOPIC, message);
    } catch (error) {
      this.logger.warn({ err: error, what }, 'Chat event could not be published');
    }
  }

  /** The rooms and groups a person is in, read once when their first stream opens here. */
  private async loadRooms(userId: string): Promise<void> {
    try {
      const rows = await this.prisma.conversationMember.findMany({
        where: { userId, conversation: { kind: { in: ['ROOM', 'GROUP'] } } },
        select: { conversationId: true },
      });
      // A join or leave that arrived while this was read is kept.
      const known = this.rooms.get(userId) ?? new Set<string>();
      for (const row of rows) known.add(row.conversationId);
      if (this.streams.has(userId)) this.rooms.set(userId, known);
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Rooms of a stream could not be read');
    }
  }

  private deliver(payload: unknown): void {
    const message = (payload ?? {}) as Partial<{
      to: unknown;
      room: unknown;
      except: unknown;
      event: ChatEvent;
      membership: { userId?: unknown; roomId?: unknown; present?: unknown };
      online: unknown;
      offline: unknown;
    }>;
    if (Array.isArray(message.online)) {
      const now = Date.now();
      for (const userId of message.online) {
        if (typeof userId === 'string') this.seen.set(userId, now);
      }
      return;
    }
    if (typeof message.offline === 'string') {
      // Another process's last page closed; if this one still has theirs, they stay online.
      if (this.streams.has(message.offline))
        void this.send({ online: [message.offline] }, 'online');
      else this.seen.delete(message.offline);
      return;
    }
    if (message.membership) {
      const { userId, roomId, present } = message.membership;
      if (typeof userId !== 'string' || typeof roomId !== 'string') return;
      if (!this.streams.has(userId)) return;
      const known = this.rooms.get(userId) ?? new Set<string>();
      if (present) known.add(roomId);
      else known.delete(roomId);
      this.rooms.set(userId, known);
      return;
    }
    if (!message.event) return;
    if (typeof message.room === 'string') {
      for (const [userId, known] of this.rooms) {
        if (userId === message.except || !known.has(message.room)) continue;
        for (const subject of this.streams.get(userId) ?? []) subject.next(message.event);
      }
      return;
    }
    if (!Array.isArray(message.to)) return;
    for (const userId of message.to) {
      if (typeof userId !== 'string') continue;
      for (const subject of this.streams.get(userId) ?? []) subject.next(message.event);
    }
  }

  private close(userId: string, subject: Subject<ChatEvent>): void {
    subject.complete();
    const rest = (this.streams.get(userId) ?? []).filter((other) => other !== subject);
    if (rest.length > 0) {
      this.streams.set(userId, rest);
      return;
    }
    if (!this.streams.has(userId)) return;
    this.streams.delete(userId);
    this.rooms.delete(userId);
    this.seen.delete(userId);
    void this.send({ offline: userId }, 'offline');
    for (const listener of this.presenceListeners) listener(userId, false);
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
