import { HttpException } from '@nestjs/common';
import { ERROR_DEFINITIONS, type ErrorCode, type ErrorDetail } from '@iua/shared';

/**
 * The one exception type services throw. It carries a stable code; the HTTP status and the
 * i18n message key come from ERROR_DEFINITIONS, so clients always get a predictable envelope.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly details?: ErrorDetail[],
  ) {
    super(ERROR_DEFINITIONS[code].message, ERROR_DEFINITIONS[code].status);
  }
}
