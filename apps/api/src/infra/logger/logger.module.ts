import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { type IncomingMessage } from 'node:http';
import { assignCorrelationId } from '../../common/correlation';
import { type Env } from '../../config/env.schema';

/**
 * Paths removed from every log line (SECURITY_MODEL.md §3, "Logging and audit").
 * Request bodies are never logged, and URLs are logged without their query string, because
 * query strings can carry tokens (e.g. /card/verify?t=...).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.mfaToken',
  '*.mfaCode',
  '*.totpSecret',
  '*.recoveryCodes',
  '*.specialistCertificateNo',
  '*.specialist_certificate_no',
];

export function serializeRequest(req: IncomingMessage & { id?: unknown }) {
  return {
    id: req.id,
    method: req.method,
    url: req.url?.split('?')[0],
  };
}

@Module({})
export class LoggerModule {
  static forRoot(env: Env): DynamicModule {
    const pretty = env.NODE_ENV === 'development';
    return {
      module: LoggerModule,
      imports: [
        PinoLoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            genReqId: assignCorrelationId,
            customAttributeKeys: { reqId: 'correlationId' },
            redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
            serializers: {
              req: serializeRequest,
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
            autoLogging: { ignore: (req) => req.url?.startsWith('/health/') ?? false },
            ...(pretty
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
      ],
    };
  }
}
