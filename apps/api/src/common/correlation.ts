import { type IncomingMessage, type ServerResponse } from 'node:http';
import { CORRELATION_ID_HEADER, isValidCorrelationId, uuidv7 } from '@iua/shared';

/**
 * Accepts a well-formed incoming correlation ID or creates a new one, and echoes it in the
 * response header. Used as pino-http's `genReqId`, so `req.id` is the correlation ID everywhere.
 */
export function assignCorrelationId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[CORRELATION_ID_HEADER];
  const id = isValidCorrelationId(incoming) ? incoming : uuidv7();
  res.setHeader(CORRELATION_ID_HEADER, id);
  return id;
}

export function correlationIdOf(req: object): string {
  const id = (req as { id?: unknown }).id;
  return typeof id === 'string' ? id : 'unknown';
}
