import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { APP_CONFIG } from '../../config/config.module';
import { type Env } from '../../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';

export type RealtimeHandler = (payload: unknown) => void;

/**
 * Passes small events between the parts of the server, so that something written through one
 * API process reaches a browser connected to another (ARCHITECTURE.md §5, ADR 0009). Events are
 * hints that name ids, never content: a lost one costs a delay, not data.
 * Demo and default: PostgreSQL's own notify and listen. Later: Redis, behind this class.
 */
export abstract class RealtimeBus {
  abstract publish(topic: string, payload: object): Promise<void>;
  /** Calls the handler for every event on the topic; the answer stops it. */
  abstract subscribe(topic: string, handler: RealtimeHandler): () => void;
}

const CHANNEL = 'iua_realtime';
/** PostgreSQL refuses a notification of 8000 bytes or more. */
const MAX_PAYLOAD_BYTES = 7000;
const RECONNECT_MS = 2000;

/**
 * NOTIFY to publish (through the ordinary pool) and one dedicated connection that LISTENs,
 * opened when the first subscriber arrives and reopened if it drops.
 */
@Injectable()
export class PgRealtimeBus extends RealtimeBus implements OnModuleDestroy {
  private readonly logger = new Logger(PgRealtimeBus.name);
  private readonly handlers = new Map<string, Set<RealtimeHandler>>();
  private listener: Client | null = null;
  private connecting: Promise<void> | null = null;
  private retry: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async publish(topic: string, payload: object): Promise<void> {
    const message = JSON.stringify({ topic, payload });
    if (Buffer.byteLength(message) > MAX_PAYLOAD_BYTES) {
      throw new Error(`Realtime event on "${topic}" is too large`);
    }
    await this.prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${message})`;
  }

  subscribe(topic: string, handler: RealtimeHandler): () => void {
    const set = this.handlers.get(topic) ?? new Set<RealtimeHandler>();
    set.add(handler);
    this.handlers.set(topic, set);
    void this.ready();
    return () => {
      set.delete(handler);
    };
  }

  /** Resolves once the listening connection is open (tests wait for it; callers needn't). */
  ready(): Promise<void> {
    if (this.listener || this.closed) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    await this.connecting?.catch(() => undefined);
    const listener = this.listener;
    this.listener = null;
    await listener?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.env.DATABASE_URL });
    client.on('notification', (notification) => this.dispatch(notification.payload));
    client.on('error', (error) => {
      this.logger.warn({ err: error }, 'Realtime listener failed');
      this.dropped(client);
    });
    client.on('end', () => this.dropped(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      if (this.closed) {
        await client.end();
        return;
      }
      this.listener = client;
    } catch (error) {
      this.logger.warn({ err: error }, 'Realtime listener could not connect');
      await client.end().catch(() => undefined);
      this.scheduleRetry();
    }
  }

  private dropped(client: Client): void {
    if (this.listener !== client) return;
    this.listener = null;
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.closed || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.ready();
    }, RECONNECT_MS);
    this.retry.unref();
  }

  private dispatch(raw: string | undefined): void {
    if (!raw) return;
    let event: { topic?: unknown; payload?: unknown };
    try {
      event = JSON.parse(raw) as { topic?: unknown; payload?: unknown };
    } catch {
      return;
    }
    if (typeof event.topic !== 'string') return;
    for (const handler of this.handlers.get(event.topic) ?? []) {
      try {
        handler(event.payload);
      } catch (error) {
        this.logger.warn({ err: error, topic: event.topic }, 'Realtime handler failed');
      }
    }
  }
}
