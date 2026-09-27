import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import {
  ERROR_DEFINITIONS,
  type ErrorCode,
  type ErrorDetail,
  type ErrorEnvelope,
  errorCodeForStatus,
} from '@iua/shared';
import { type Request, type Response } from 'express';
import { AppException } from '../errors/app.exception';
import { correlationIdOf } from '../correlation';

/**
 * Turns every error into the envelope from API_DESIGN.md §2. Stack traces, SQL and framework
 * messages are logged server-side only; the client gets a code, an i18n key and the correlation ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = correlationIdOf(request);

    const { code, details } = this.classify(exception);
    const { status, message } = ERROR_DEFINITIONS[code];

    if (status >= 500) {
      this.logger.error({ err: exception, correlationId }, 'Unhandled error');
    }

    const body: ErrorEnvelope = {
      error: { code, message, ...(details?.length ? { details } : {}), correlationId },
    };
    response.status(status).json(body);
  }

  private classify(exception: unknown): { code: ErrorCode; details?: ErrorDetail[] } {
    if (exception instanceof AppException) {
      return { code: exception.code, ...(exception.details ? { details: exception.details } : {}) };
    }
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        code: 'VALIDATION_FAILED',
        details: zodError instanceof ZodError ? toDetails(zodError) : [],
      };
    }
    if (exception instanceof HttpException) {
      return { code: errorCodeForStatus(exception.getStatus()) };
    }
    return { code: 'INTERNAL_ERROR' };
  }
}

function toDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    ...(issue.path.length ? { field: issue.path.join('.') } : {}),
    code: issue.code.toUpperCase(),
  }));
}
